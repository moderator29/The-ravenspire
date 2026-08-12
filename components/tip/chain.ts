/* Chain metadata for on-chain tipping. THE RAVENSPIRE tips are native-token,
   wallet-to-wallet transfers sent from the tipper's Privy embedded wallet on
   whatever EVM chain that wallet is currently on. We resolve the chain at send
   time from the wallet itself, so this table only needs to map a chain id to
   the human name, native symbol, and block explorer used for the receipt. */

export type TipChain = {
  id: number;
  name: string;
  symbol: string;
  /* Explorer origin, no trailing slash. */
  explorer: string;
};

const CHAINS: Record<number, TipChain> = {
  1: { id: 1, name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io" },
  8453: { id: 8453, name: "Base", symbol: "ETH", explorer: "https://basescan.org" },
  10: {
    id: 10,
    name: "OP Mainnet",
    symbol: "ETH",
    explorer: "https://optimistic.etherscan.io",
  },
  42161: {
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    explorer: "https://arbiscan.io",
  },
  137: {
    id: 137,
    name: "Polygon",
    symbol: "POL",
    explorer: "https://polygonscan.com",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    symbol: "ETH",
    explorer: "https://sepolia.etherscan.io",
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    symbol: "ETH",
    explorer: "https://sepolia.basescan.org",
  },
};

/* Privy's embedded wallet defaults to Ethereum mainnet when providers.tsx does
   not pin a chain (it currently does not). This is the fallback we assume when
   the wallet does not report a recognised chain. */
export const DEFAULT_TIP_CHAIN_ID = 1;

export function resolveChain(chainId: number | null | undefined): TipChain {
  if (chainId != null && CHAINS[chainId]) return CHAINS[chainId];
  return CHAINS[DEFAULT_TIP_CHAIN_ID];
}

/* Best-effort explorer link. Falls back to the multi-chain Blockscan resolver
   for a chain we do not have an explorer origin for, so a receipt link always
   works. */
export function explorerTxUrl(
  chainId: number | null | undefined,
  hash: string
): string {
  const base = chainId != null ? CHAINS[chainId]?.explorer : undefined;
  if (base) return `${base}/tx/${hash}`;
  return `https://blockscan.com/tx/${hash}`;
}

/* Wallets report their chain either as a plain number or a CAIP-2 string like
   "eip155:8453". Normalise both to a number. */
export function parseChainId(
  raw: string | number | null | undefined
): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const match = /(\d+)\s*$/.exec(raw);
  return match ? Number(match[1]) : null;
}

/* Preset tribute sizes, in the native token. Deliberately small: these are
   real transfers of real value. */
export const TIP_PRESETS = [0.001, 0.005, 0.01, 0.05] as const;
