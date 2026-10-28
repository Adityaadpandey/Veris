// Sepolia deployment (CandidERC1155 + DeviceRegistry). Keep in sync with deployment.json.
export const VERIS_ADDRESS = '0x4d6de10212f375ae896B22dC8Fc73F6F6bf2DE9f'
export const DEVICE_REGISTRY_ADDRESS = '0x16dA5f3b55FB02665075531cC9b1E5901D36A0C5'

// Only the bits the portal uses. The CID, image hash and signature are no longer
// stored on-chain: the contract keeps a metadataHash, and the full document lives
// at baseURI<tokenId> (also mirrored in the claim server record).
export const VERIS_ABI = [
  {
    name: 'totalTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'mintEdition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_originalTokenId', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getTokenMetadata',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_tokenId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'deviceAddress', type: 'address' },
        { name: 'metadataHash', type: 'bytes32' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'maxEditions', type: 'uint256' },
        { name: 'isOriginal', type: 'bool' },
        { name: 'originalTokenId', type: 'uint256' },
      ],
    }],
  },
]

// getTokenMetadata returns an all-zero struct for ids that don't exist on this contract
// (e.g. tokens minted on the previous contract), so "has data" means a non-zero device.
export const hasTokenData = (meta) =>
  !!meta && meta.deviceAddress !== '0x0000000000000000000000000000000000000000'
