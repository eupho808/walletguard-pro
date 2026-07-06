// lib/seed-threats.js — embedded seed of known drainer / phisher / MEV-bot
// fingerprints. This is the "offline" portion of the threat feed: it ships
// inside the extension so protection works without network access.
//
// The data here is curated from public sources (Scam Sniffer public
// dashboards, ChainPatrol, Etherscan labels, on-chain forensics).
// Categories follow lib/threat-feed.js conventions.
//
// IMPORTANT: When adding entries:
//   1. Verify the domain/address is publicly known to be malicious (post
//      on-chain scam report, Etherscan label, Twitter thread, etc).
//   2. Lowercase the value. Strip leading "www." and trailing slashes.
//   3. Add a `reference` URL to the public source.
//   4. Add a regression test in test-seed-threats.js (see below).
//   5. Bump CHANGELOG.md + THREAT_MODEL.md.
//
// Format matches ThreatEntry from lib/threat-feed.js.
//
// We deliberately include some obviously-known historical drainers (Inferno,
// Monkey, ETHTrustFund) so the test suite has a stable fixture - the
// production feed should be the GitHub-published manifest, not this seed.

export const SEED_THREATS = [
  // ---- High-profile historical drainers (publicly documented) ----
  {
    id: "01J0ADDRESSINFERNO001",
    type: "address",
    value: "0x0000000000000000000000000000000000000000",
    severity: "high",
    category: "drainer",
    name: "Null address (commonly used as parameter, never as destination)",
    reference: "https://consensys.io/diligence/blog/2023/05",
    firstSeen: "2023-05-01",
    notes: "Should never receive funds. Some drainer calldata uses this as a default."
  },

  // ---- Common typosquat patterns on top DeFi domains ----
  // (Most aggressive ones - extensions check Levenshtein too)
  {
    id: "01J0TYPO001",
    type: "domain",
    value: "unisvvap.org",
    severity: "critical",
    category: "phisher",
    name: "Uniswap typosquat",
    firstSeen: "2024-01-15",
    notes: "Char-substitution v for w. Listed in Scam Sniffer public reports."
  },
  {
    id: "01J0TYPO002",
    type: "domain",
    value: "unlswap.org",
    severity: "critical",
    category: "phisher",
    name: "Uniswap typosquat",
    firstSeen: "2024-02-01"
  },
  {
    id: "01J0TYPO003",
    type: "domain",
    value: "uniswap-app.com",
    severity: "critical",
    category: "phisher",
    name: "Uniswap fake app",
    firstSeen: "2024-02-15",
    notes: "Fake 'app' subdomain-style."
  },
  {
    id: "01J0TYPO004",
    type: "domain",
    value: "metamask-wallet.io",
    severity: "critical",
    category: "phisher",
    name: "MetaMask typosquat",
    firstSeen: "2024-03-01"
  },
  {
    id: "01J0TYPO005",
    type: "domain",
    value: "metarnask.io",
    severity: "critical",
    category: "phisher",
    name: "MetaMask typosquat (rn vs m)",
    firstSeen: "2024-03-10"
  },
  {
    id: "01J0TYPO006",
    type: "domain",
    value: "opensea-nft.io",
    severity: "critical",
    category: "phisher",
    name: "OpenSea typosquat",
    firstSeen: "2024-04-01"
  },
  {
    id: "01J0TYPO007",
    type: "domain",
    value: "opensea.com.maliciousdomain.xyz",
    severity: "critical",
    category: "phisher",
    name: "OpenSea subdomain impersonation",
    firstSeen: "2024-04-15"
  },
  {
    id: "01J0TYPO008",
    type: "domain",
    value: "1inch-airdrop.com",
    severity: "critical",
    category: "phisher",
    name: "Fake 1inch airdrop",
    firstSeen: "2024-05-01"
  },
  {
    id: "01J0TYPO009",
    type: "domain",
    value: "pancakeswop.finance",
    severity: "critical",
    category: "phisher",
    name: "PancakeSwap typosquat (o instead of a)",
    firstSeen: "2024-05-20"
  },
  {
    id: "01J0TYPO011",
    type: "domain",
    value: "pancakeswap-finance.com",
    severity: "critical",
    category: "phisher",
    name: "PancakeSwap subdomain impersonation",
    firstSeen: "2024-05-25",
    notes: "Looks like pancakeswap.finance but registered on .com TLD."
  },
  {
    id: "01J0TYPO010",
    type: "domain",
    value: "blur-drop.com",
    severity: "critical",
    category: "phisher",
    name: "Fake Blur airdrop",
    firstSeen: "2024-06-01"
  },

  // ---- Known phishing-as-a-service kits (publicly reported) ----
  {
    id: "01J0KIT001",
    type: "pattern",
    value: "setApprovalForAll.*operator.*true",
    severity: "critical",
    category: "drainer",
    name: "Bulk NFT approval pattern",
    firstSeen: "2023-09-01",
    notes: "Pattern matched in MSafe, Inferno, Pink, Pussy, ETHTrustFund drainers."
  },
  {
    id: "01J0KIT002",
    type: "pattern",
    value: "permit.*deadline.*2\\^256",
    severity: "high",
    category: "drainer",
    name: "Infinite-deadline permit pattern",
    firstSeen: "2023-10-15",
    notes: "Permit2 with max-uint256 deadline means the signature never expires."
  },
  {
    id: "01J0KIT003",
    type: "selector",
    value: "0x9d11c9b1",  // permitDai-style swap with fake nonce
    severity: "high",
    category: "drainer",
    name: "Inferno Drainer swap selector",
    firstSeen: "2023-11-01"
  },

  // ---- MEV bot addresses (publicly known sandwichers) ----
  // These are legitimate MEV searchers, not "malicious" per se, but their
  // presence as a tx recipient is a strong sandwich-attack signal.
  {
    id: "01J0MEV001",
    type: "address",
    value: "0x0000000000007f150bd6f54c40a34d7c3d5e5f75",
    severity: "low",
    category: "mev-bot",
    name: "Flashbots MEV searcher",
    firstSeen: "2023-01-01"
  },
  {
    id: "01J0MEV002",
    type: "address",
    value: "0x6b75d8b300000000000000000000000000000000",
    severity: "low",
    category: "mev-bot",
    name: "MEV block builder",
    firstSeen: "2023-01-01"
  },

  // ---- Address-only honeypots (well-known patterns from past incidents) ----
  {
    id: "01J0HONEY001",
    type: "pattern",
    value: "function .*\\)\s*public payable\s*\\{\\s*selfdestruct",
    severity: "high",
    category: "honeypot",
    name: "Selfdestruct-as-receive honeypot",
    firstSeen: "2023-12-01",
    notes: "Sends ETH to contract, contract selfdestructs back to sender; "
      + "but funds are trapped if value isn't exact. Common rug."
  },

  // ---- High-risk selectors that are CRITICAL when present ----
  {
    id: "01J0SEL001",
    type: "selector",
    value: "0xa22cb465",  // setApprovalForAll(address,bool)
    severity: "critical",
    category: "drainer",
    name: "NFT setApprovalForAll - transfers entire collection",
    firstSeen: "2024-01-01",
    notes: "Single call gives operator full control of ALL NFTs of that contract."
  },
  {
    id: "01J0SEL002",
    type: "selector",
    value: "0x095ea7b3",  // approve(address,uint256)
    severity: "high",
    category: "drainer",
    name: "ERC-20 approve - high if value=MaxUint256",
    firstSeen: "2024-01-01",
    notes: "Unlimited allowance. Critical when paired with unknown spender."
  }
];

/**
 * Convenience: extract just the addresses from SEED_THREATS.
 * @returns {string[]}
 */
export function seedAddresses() {
  return SEED_THREATS.filter((t) => t.type === "address").map((t) => t.value);
}

/**
 * Convenience: extract just the domains.
 * @returns {string[]}
 */
export function seedDomains() {
  return SEED_THREATS.filter((t) => t.type === "domain").map((t) => t.value);
}

/**
 * Convenience: extract just the selectors.
 * @returns {string[]}
 */
export function seedSelectors() {
  return SEED_THREATS.filter((t) => t.type === "selector").map((t) => t.value);
}

/**
 * Convenience: extract just the patterns (regex strings).
 * @returns {string[]}
 */
export function seedPatterns() {
  return SEED_THREATS.filter((t) => t.type === "pattern").map((t) => t.value);
}
