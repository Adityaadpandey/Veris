# Arkiv schema

Writer wallet (testnet, chain id 7794095): `0xC15aF2A372D01B5223819bB328400DB8b14d1894`
Code: `public-server/arkivService.js`. Postgres stays the permanent record; Arkiv holds the
copy that people can query and that expires on its own.

## `veris-claim`: one per captured photo

| Field | Type | Queried? | What it is |
|---|---|---|---|
| `claimId` | str, indexed | yes | The claim the QR code points at. Used by the claim page. |
| `imageHash` | str, indexed | yes | Hash of the photo. The verify page searches by it. |
| `deviceId` | str, indexed, optional | yes | Which camera took it. "Everything this camera shot". |
| `owner` | addr, indexed, optional | yes | Wallet that owns the NFT once claimed. |
| `status` | str, indexed | yes | `pending` or `minted`. |
| `record` | bytes | no | The full provenance JSON (storage CIDs, tx hashes per chain). |

- **Owner of the entity:** the writer wallet above (the backend signs for the camera).
- **Expiry:** `pending` lives 24 hours, so abandoned captures vanish. When the mint lands, a
  new `minted` entity is created with the longest life Arkiv allows (`ARKIV_CLAIM_DAYS`,
  capped at 180). Unchanged state is patched in place instead of re-created.

## `veris-license`: one per USDC license bought on Arc

| Field | Type | Queried? | What it is |
|---|---|---|---|
| `tokenId` | str, indexed | yes | The licensed photo's token. |
| `licensee` | str, indexed | yes | Editor's wallet, lower-cased. |
| `chain` | str | no | Which chain the payment happened on (Arc). |
| `txHash` | str | no | The `buyLicense` transaction. |
| `record` | bytes | no | The full license JSON. |

- **Expiry:** exactly the license's end time (`ExpirationTime.atDate(expiresAt)`), so
  "is this still licensed" is "does the entity still exist".
- The payment itself is confirmed from the chain before the entity is written
  (`POST /api/license/record`).
