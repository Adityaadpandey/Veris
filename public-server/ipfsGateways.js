// Gateways tried in order when we need the bytes behind a CID.
//
// New uploads are pinned on Filebase, so its gateway goes first. Older photos were pinned on
// Lighthouse and only resolve on the gateway of the API key that uploaded them (the subdomain
// changed whenever the key was rotated), so every old one stays in the list. The public
// gateways at the end are a last resort and rarely have Lighthouse-only CIDs.
const FILEBASE_GATEWAY = process.env.FILEBASE_GATEWAY || 'https://brainy-coral-silverfish.myfilebase.com/ipfs';
const LIGHTHOUSE_GATEWAY = process.env.LIGHTHOUSE_GATEWAY || 'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs';

const IPFS_GATEWAYS = [
  FILEBASE_GATEWAY,
  LIGHTHOUSE_GATEWAY,
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs'
];

module.exports = { IPFS_GATEWAYS };
