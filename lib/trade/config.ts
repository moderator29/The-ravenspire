/* The Ravenspire trading surface, one place for every tunable. In-app buy,
   sell and swap route through the 0x Swap API against EVM chains only. No
   Solana, ever: the Scrying Glass, the coin pages and the Swap all guard on
   the EVM allowlist below. Non-custodial throughout; the member's own Privy
   embedded wallet signs and sends every transaction.

   BETA: the whole trading surface ships behind a beta badge. */

/* The 0.5% platform fee, taken transparently through 0x's own fee params
   (swapFeeBps + swapFeeRecipient + swapFeeToken) so it is on-chain and never
   hidden. When no recipient is configured the fee simply is not applied, so a
   missing env var can never silently misroute funds. */
export const PLATFORM_FEE_BPS = 50; // 0.5%

/* Server-side only. Set PLATFORM_FEE_RECIPIENT to the treasury 0x address that
   collects the 0.5% fee. Absent, we quote and trade with no fee attached. */
export function feeRecipient(): string | null {
  const addr = process.env.PLATFORM_FEE_RECIPIENT;
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return addr;
}

/* Quality floors for what the Scrying Glass will surface. Thin pools and
   micro-cap launches skew to scams, so we drop anything below these before a
   coin ever reaches the glass, and log the drop count. Tune here, nowhere
   else. */
export const MIN_LIQUIDITY_USD = 10_000;
export const MIN_MARKET_CAP_USD = 40_000;

/* An EVM chain the realm trades on. `id` is the EIP-155 chain id; `gecko` is
   the GeckoTerminal / DexScreener-ish network slug used by discovery; `dex` is
   the DexScreener chainId label; `zeroxBase` is the 0x Swap API host for that
   chain. Native gas symbol is what the member needs to pay fees and to buy
   with (the quote/sell token for a market buy). */
export interface TradeChain {
  id: number;
  name: string;
  short: string;
  native: string;
  gecko: string;
  dex: string;
  zeroxBase: string;
  explorer: string;
  /* Wrapped-native contract, used as the sell/buy token for market buys and
     sells so the member trades against the deepest pools. */
  wrappedNative: string;
}

/* 0x Swap API v2 is a single host with a `chainId` param, but we keep a field
   per chain so a future per-chain host swap is a one-line change. */
const ZEROX_BASE = "https://api.0x.org";

export const TRADE_CHAINS: TradeChain[] = [
  {
    id: 1,
    name: "Ethereum",
    short: "ETH",
    native: "ETH",
    gecko: "eth",
    dex: "ethereum",
    zeroxBase: ZEROX_BASE,
    explorer: "https://etherscan.io",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  {
    id: 8453,
    name: "Base",
    short: "BASE",
    native: "ETH",
    gecko: "base",
    dex: "base",
    zeroxBase: ZEROX_BASE,
    explorer: "https://basescan.org",
    wrappedNative: "0x4200000000000000000000000000000000000006",
  },
  {
    id: 42161,
    name: "Arbitrum",
    short: "ARB",
    native: "ETH",
    gecko: "arbitrum",
    dex: "arbitrum",
    zeroxBase: ZEROX_BASE,
    explorer: "https://arbiscan.io",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  {
    id: 10,
    name: "Optimism",
    short: "OP",
    native: "ETH",
    gecko: "optimism",
    dex: "optimism",
    zeroxBase: ZEROX_BASE,
    explorer: "https://optimistic.etherscan.io",
    wrappedNative: "0x4200000000000000000000000000000000000006",
  },
  {
    id: 56,
    name: "BNB Chain",
    short: "BNB",
    native: "BNB",
    gecko: "bsc",
    dex: "bsc",
    zeroxBase: ZEROX_BASE,
    explorer: "https://bscscan.com",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
  {
    id: 137,
    name: "Polygon",
    short: "POL",
    native: "POL",
    gecko: "polygon_pos",
    dex: "polygon",
    zeroxBase: ZEROX_BASE,
    explorer: "https://polygonscan.com",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  {
    id: 43114,
    name: "Avalanche",
    short: "AVAX",
    native: "AVAX",
    gecko: "avax",
    dex: "avalanche",
    zeroxBase: ZEROX_BASE,
    explorer: "https://snowtrace.io",
    wrappedNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  },
];

/* The 0x "native token" sentinel used for ETH/BNB/AVAX etc. in sell/buy token
   slots. */
export const NATIVE_TOKEN_SENTINEL =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/* GeckoTerminal network slugs we allow through discovery. Anything not in this
   set (Solana above all) is dropped. */
export const EVM_GECKO_NETWORKS = new Set(TRADE_CHAINS.map((c) => c.gecko));

/* DexScreener chainId labels we allow. Same allowlist, different slug field. */
export const EVM_DEX_CHAINS = new Set(TRADE_CHAINS.map((c) => c.dex));

export function tradeChainByGecko(slug: string): TradeChain | undefined {
  return TRADE_CHAINS.find((c) => c.gecko === slug);
}

export function tradeChainByDex(slug: string): TradeChain | undefined {
  return TRADE_CHAINS.find((c) => c.dex === slug);
}

export function tradeChainById(id: number): TradeChain | undefined {
  return TRADE_CHAINS.find((c) => c.id === id);
}

export function isEvmGeckoNetwork(slug: string | undefined | null): boolean {
  return !!slug && EVM_GECKO_NETWORKS.has(slug);
}

export function isEvmDexChain(slug: string | undefined | null): boolean {
  return !!slug && EVM_DEX_CHAINS.has(slug);
}
