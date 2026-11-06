import { defineChain, parseAbi } from 'viem'

// Arc testnet (docs.arc.network). USDC is the gas token here, so no separate gas balance is needed.
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
})

// Defaults are the live Arc testnet deployment (contracts/deployment-5042002.json and Circle's
// USDC ERC-20 interface), so the license button works without any env. Override per environment if redeployed.
export const LICENSE_ADDRESS = import.meta.env.VITE_LICENSE_ADDRESS || '0xA1B6ea0133da15dCFB5A5b4704022e4041f3Edb9'
export const ARC_USDC_ADDRESS = import.meta.env.VITE_ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000'
export const LICENSE_PRICE = 5_000_000n // 5 USDC, 6 decimals through the ERC-20 interface

export const LICENSE_ABI = parseAbi([
  'function buyLicense(uint256 tokenId, address photographer) returns (uint64)',
  'function isLicensed(uint256 tokenId, address licensee) view returns (bool)',
])
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
])
