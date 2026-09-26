// Every chain a photo can be minted on, with the bits the UI needs to label and link it.
// Which one a claim lives on comes from the claim server's provenance record (chains[].chain),
// not from a global default: the same photo can be on Arc while an older one is on Sepolia.
export const CHAINS = {
  sepolia: {
    key: 'sepolia', id: 11155111, name: 'Sepolia Testnet', short: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io', explorerName: 'Etherscan',
    veris: '0xA1B6ea0133da15dCFB5A5b4704022e4041f3Edb9',
    nft: (c, id) => `https://sepolia.etherscan.io/nft/${c.veris}/${id}`,
  },
  arc: {
    key: 'arc', id: 5042002, name: 'Arc Testnet', short: 'Arc',
    explorer: 'https://testnet.arcscan.app', explorerName: 'ArcScan',
    veris: '0xB7909d4bba142AfF48aF7509B070e64eC1c6AdAc',
    nft: (c, id) => `https://testnet.arcscan.app/token/${c.veris}/instance/${id}`,
  },
}

export const txUrl = (c, hash) => (c && hash ? `${c.explorer}/tx/${hash}` : null)
export const addressUrl = (c, addr) => (c && addr ? `${c.explorer}/address/${addr}` : null)

// The chain the claim's own tx_hash was minted on. Falls back to the first chain on record, then
// to Sepolia for old claims that never got a provenance record.
export function resolveChain(claim, prov) {
  const list = prov?.chains || []
  const hit = list.find((c) => c.txHash && c.txHash === claim?.tx_hash) || list[0]
  return CHAINS[hit?.chain] || CHAINS.sepolia
}
