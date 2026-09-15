"""
Blockchain service — all web3.py calls are wrapped in asyncio.to_thread
so they don't block FastAPI's event loop.
"""

import asyncio
import json
import logging
from pathlib import Path

from web3 import Web3

from config import get_settings

logger = logging.getLogger(__name__)

# In-memory cache: token_id -> tx_hash
# Populated on mint; used to avoid slow event-log lookups on verify.
_tx_cache: dict[int, str] = {}

_ABI_PATH = Path(__file__).parent / "abi.json"


# ─── Public async API ────────────────────────────────────────────────────────


async def mint_proof(
    image_hash_bytes: bytes,
    score: int,
    ipfs_cid: str,
    device_id: str,
) -> tuple[int, str]:
    """Mint a proof token. Returns (token_id, tx_hash)."""
    return await asyncio.to_thread(
        _mint_proof_sync, image_hash_bytes, score, ipfs_cid, device_id
    )


async def get_photo_data(token_id: int) -> dict:
    """Fetch on-chain photo data for a token. Raises on non-existent token."""
    return await asyncio.to_thread(_get_photo_data_sync, token_id)


async def claim_photo(token_id: int, claimer_address: str) -> str:
    """Mint a copy of the proof to a claimer's wallet. Returns tx_hash."""
    return await asyncio.to_thread(_claim_photo_sync, token_id, claimer_address)


# ─── Sync implementations (run in thread pool) ───────────────────────────────


def _mint_proof_sync(
    image_hash_bytes: bytes,
    score: int,
    ipfs_cid: str,
    device_id: str,
) -> tuple[int, str]:
    w3, contract, account = _setup()

    tx = contract.functions.mintProof(
        image_hash_bytes,
        score,
        ipfs_cid,
        device_id,
    ).build_transaction(_base_tx(w3, account.address, gas=350_000))

    tx_hash_bytes = _send(w3, tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=120)

    if receipt.status == 0:
        raise RuntimeError("mintProof transaction reverted")

    events = contract.events.PhotoMinted().process_receipt(receipt)
    if not events:
        raise RuntimeError("PhotoMinted event not found in receipt")

    token_id: int = events[0]["args"]["tokenId"]
    tx_hash_hex = tx_hash_bytes.hex()

    _tx_cache[token_id] = tx_hash_hex
    logger.info("Minted token %d tx=%s", token_id, tx_hash_hex)
    return token_id, tx_hash_hex


def _get_photo_data_sync(token_id: int) -> dict:
    w3, contract, _ = _setup()

    try:
        data = contract.functions.getPhotoData(token_id).call()
    except Exception as exc:
        # Surface contract revert as a recognisable string
        if "TokenDoesNotExist" in str(exc):
            raise LookupError(f"TokenDoesNotExist({token_id})") from exc
        raise

    tx_hash = _tx_cache.get(token_id) or _lookup_mint_tx(w3, contract, token_id)

    return {
        "token_id": token_id,
        "image_hash": "0x" + data[0].hex(),     # bytes32 → hex
        "authenticity_score": data[1],           # uint8
        "timestamp": data[2],                    # uint64
        "device_id": data[3],                    # string
        "ipfs_cid": data[4],                     # string
        "is_verified": True,                     # exists on-chain = verified
        "tx_hash": tx_hash,
    }


def _claim_photo_sync(token_id: int, claimer_address: str) -> str:
    w3, contract, account = _setup()

    checksummed = Web3.to_checksum_address(claimer_address)

    tx = contract.functions.claimPhoto(token_id, checksummed).build_transaction(
        _base_tx(w3, account.address, gas=200_000)
    )

    tx_hash_bytes = _send(w3, tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash_bytes, timeout=120)

    if receipt.status == 0:
        raise RuntimeError("claimPhoto transaction reverted")

    tx_hash_hex = tx_hash_bytes.hex()
    logger.info("Claimed token %d for %s tx=%s", token_id, checksummed, tx_hash_hex)
    return tx_hash_hex


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _setup():
    """Return (web3, contract, account). Called fresh each invocation (thread-safe)."""
    settings = get_settings()
    w3 = Web3(Web3.HTTPProvider(settings.rpc_url))
    abi = json.loads(_ABI_PATH.read_text())
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(settings.contract_address),
        abi=abi,
    )
    account = w3.eth.account.from_key(settings.private_key)
    return w3, contract, account


def _base_tx(w3: Web3, sender: str, gas: int) -> dict:
    """Build the common transaction fields using EIP-1559 pricing."""
    latest = w3.eth.get_block("latest")
    base_fee: int = latest.get("baseFeePerGas", w3.eth.gas_price)
    max_priority = w3.to_wei(1, "gwei")
    max_fee = base_fee * 2 + max_priority

    return {
        "from": sender,
        "nonce": w3.eth.get_transaction_count(sender),
        "gas": gas,
        "maxFeePerGas": max_fee,
        "maxPriorityFeePerGas": max_priority,
    }


def _send(w3: Web3, tx: dict):
    """Sign and broadcast a transaction. Returns the raw tx hash HexBytes."""
    settings = get_settings()
    signed = w3.eth.account.sign_transaction(tx, settings.private_key)
    return w3.eth.send_raw_transaction(signed.raw_transaction)


def _lookup_mint_tx(w3: Web3, contract, token_id: int) -> str | None:
    """
    Look up the tx hash for a PhotoMinted event by token_id.
    tokenId is an indexed field so the filter is applied server-side.
    Note: scanning from block 0 is slow on mainnet — consider a block-range cache
    or an off-chain indexer for production use.
    """
    try:
        logs = contract.events.PhotoMinted.get_logs(
            from_block=0,
            argument_filters={"tokenId": token_id},
        )
        if logs:
            return logs[0].transactionHash.hex()
    except Exception as exc:
        logger.warning("Could not look up mint tx for token %d: %s", token_id, exc)
    return None
