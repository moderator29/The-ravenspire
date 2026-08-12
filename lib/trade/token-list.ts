/* A curated base token list per EVM chain: the native coin plus the deep
   stablecoins and blue chips, so The Swap always opens on real tokens (ETH to
   USDC by default) instead of waiting on a member's holdings. Anything not
   here is found by search (DexScreener) and hydrated on select. Decimals are
   correct per chain (note BSC stablecoins are 18 decimals, not 6).

   Logos come from the Trust Wallet asset pack (a free CDN over GitHub raw),
   which serves checksummed per-chain token icons and native-coin icons. Every
   base token below has its logo resolved automatically at module load; the
   TokenLogo component still falls back to a glyph badge if an icon 404s. */

import { getAddress } from "viem";

export interface ListedToken {
  chainId: number;
  /* null address means the chain's native coin (ETH, BNB, AVAX, POL). */
  address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  popular?: boolean;
}

/* Trust Wallet blockchain folder per EVM chain id. */
const TW_CHAIN: Record<number, string> = {
  1: "ethereum",
  56: "smartchain",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  43114: "avalanchec",
};

const TW_BASE =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

/* Native-coin icon by ticker, so ETH on an L2 shows the Ether coin (not the
   L2's own chain mark) and BNB/POL/AVAX each show their own. */
const NATIVE_LOGO: Record<string, string> = {
  ETH: `${TW_BASE}/ethereum/info/logo.png`,
  BNB: `${TW_BASE}/smartchain/info/logo.png`,
  POL: `${TW_BASE}/polygon/info/logo.png`,
  MATIC: `${TW_BASE}/polygon/info/logo.png`,
  AVAX: `${TW_BASE}/avalanchec/info/logo.png`,
};

/* The chain's own mark, used for the small chain badge beside a coin logo. */
export function chainLogo(chainId: number): string | null {
  const slug = TW_CHAIN[chainId];
  return slug ? `${TW_BASE}/${slug}/info/logo.png` : null;
}

/* Resolve a Trust Wallet logo URL for any token on a supported chain. Native
   coins (null address) map by ticker; ERC-20s use the checksummed contract.
   Returns null when the chain is unsupported or the address won't checksum. */
export function trustWalletLogo(
  chainId: number,
  address: string | null,
  symbol?: string
): string | null {
  if (!address) {
    return symbol ? (NATIVE_LOGO[symbol.toUpperCase()] ?? null) : null;
  }
  const slug = TW_CHAIN[chainId];
  if (!slug) return null;
  try {
    const checksum = getAddress(address);
    return `${TW_BASE}/${slug}/assets/${checksum}/logo.png`;
  } catch {
    return null;
  }
}

const RAW_TOKENS: ListedToken[] = raw();

function native(
  chainId: number,
  symbol: string,
  name: string
): ListedToken {
  return { chainId, address: null, symbol, name, decimals: 18, logo: null, popular: true };
}

function raw(): ListedToken[] {
  return [
  // Ethereum
  native(1, "ETH", "Ethereum"),
  { chainId: 1, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 1, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, logo: null, popular: true },
  { chainId: 1, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai", decimals: 18, logo: null },
  { chainId: 1, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, logo: null },
  { chainId: 1, address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18, logo: null },

  // Base
  native(8453, "ETH", "Ethereum"),
  { chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 8453, address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18, logo: null },

  // Arbitrum
  native(42161, "ETH", "Ethereum"),
  { chainId: 42161, address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 42161, address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", name: "Tether USD", decimals: 6, logo: null },
  { chainId: 42161, address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", name: "Wrapped Ether", decimals: 18, logo: null },

  // Optimism
  native(10, "ETH", "Ethereum"),
  { chainId: 10, address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 10, address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18, logo: null },

  // BNB Chain (stablecoins are 18 decimals here)
  native(56, "BNB", "BNB"),
  { chainId: 56, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin", decimals: 18, logo: null, popular: true },
  { chainId: 56, address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", decimals: 18, logo: null, popular: true },
  { chainId: 56, address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", name: "Wrapped BNB", decimals: 18, logo: null },

  // Polygon
  native(137, "POL", "Polygon"),
  { chainId: 137, address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 137, address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", name: "Tether USD", decimals: 6, logo: null },
  { chainId: 137, address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", name: "Wrapped Ether", decimals: 18, logo: null },

  // Avalanche
  native(43114, "AVAX", "Avalanche"),
  { chainId: 43114, address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", name: "USD Coin", decimals: 6, logo: null, popular: true },
  { chainId: 43114, address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "WAVAX", name: "Wrapped AVAX", decimals: 18, logo: null },
  ];
}

/* Every base token with its Trust Wallet logo resolved once at module load. */
export const BASE_TOKENS: ListedToken[] = RAW_TOKENS.map((t) => ({
  ...t,
  logo: t.logo ?? trustWalletLogo(t.chainId, t.address, t.symbol),
}));

export function tokensForChain(chainId: number): ListedToken[] {
  return BASE_TOKENS.filter((t) => t.chainId === chainId);
}

export function nativeToken(chainId: number): ListedToken | undefined {
  return BASE_TOKENS.find((t) => t.chainId === chainId && t.address === null);
}

/* The default "buy" token for a chain: its USDC. */
export function defaultQuoteToken(chainId: number): ListedToken | undefined {
  return BASE_TOKENS.find(
    (t) => t.chainId === chainId && t.symbol === "USDC"
  );
}
