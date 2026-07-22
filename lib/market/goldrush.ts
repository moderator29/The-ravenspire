import "server-only";
import { formatUnits } from "viem";

/* GoldRush (Covalent) portfolio reads. Real data only; when the key is
   absent or a chain is unreachable we omit it rather than inventing rows. */

export const LEDGER_CHAINS = [
  { id: "eth-mainnet", label: "Ethereum", watch: "1" },
  { id: "base-mainnet", label: "Base", watch: "8453" },
  { id: "arbitrum-mainnet", label: "Arbitrum", watch: "42161" },
  { id: "optimism-mainnet", label: "Optimism", watch: "10" },
  { id: "bsc-mainnet", label: "BNB Chain", watch: "56" },
] as const;

export type LedgerChainId = (typeof LEDGER_CHAINS)[number]["id"];

export interface Holding {
  symbol: string;
  name: string;
  balance: string;
  quoteUsd: number;
  change24hUsd: number;
  logo: string | null;
  address: string | null;
  chain: string;
  chainLabel: string;
  watchChain: string;
}

interface GoldRushItem {
  contract_ticker_symbol: string | null;
  contract_name: string | null;
  contract_decimals: number | null;
  contract_address: string | null;
  balance: string | null;
  quote: number | null;
  quote_rate: number | null;
  quote_rate_24h?: number | null;
  logo_url: string | null;
  is_spam?: boolean | null;
  type?: string | null;
}

/* Precise display amount. Number() loses precision above 2^53, so we format
   the raw uint256 with BigInt-safe formatUnits and group by hand. */
export function displayAmount(raw: string, decimals: number): string {
  let s: string;
  try {
    s = formatUnits(BigInt(raw), decimals);
  } catch {
    return "0";
  }
  const [intPart, fracPart = ""] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const big = BigInt(intPart) >= 1000n;
  const frac = fracPart.slice(0, big ? 2 : 4).replace(/0+$/, "");
  return frac ? `${grouped}.${frac}` : grouped;
}

/* Authorization header keeps the paid key out of the URL (and out of proxy
   logs and the Next data-cache key). Covalent accepts Basic base64(key:). */
function authHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function fetchChainBalances(
  key: string,
  chain: LedgerChainId,
  address: string
): Promise<Holding[]> {
  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/${chain}/address/${address}/balances_v2/?quote-currency=USD&nft=false&no-spam=true`,
      {
        headers: { Authorization: authHeader(key) },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { items?: GoldRushItem[] } };
    const chainMeta = LEDGER_CHAINS.find((c) => c.id === chain);
    const chainLabel = chainMeta?.label ?? chain;
    const watchChain = chainMeta?.watch ?? "1";

    return (body.data?.items ?? [])
      // Drop spam / dust the no-spam flag missed (fake-airdrop net-worth
      // inflation is a credibility wound for a trust-first product).
      .filter((it) => !it.is_spam && it.type !== "dust")
      .map((it) => {
        const rate = it.quote_rate ?? 0;
        const rate24 = it.quote_rate_24h ?? rate;
        const bal = it.balance ?? "0";
        const decimals = it.contract_decimals ?? 18;
        let amount = 0;
        try {
          amount = Number(formatUnits(BigInt(bal), decimals));
        } catch {
          amount = 0;
        }
        const quoteUsd = it.quote ?? 0;
        const change24hUsd = Number.isFinite(amount)
          ? amount * (rate - rate24)
          : 0;
        return {
          symbol: it.contract_ticker_symbol ?? "?",
          name: it.contract_name ?? "Unknown token",
          balance: displayAmount(bal, decimals),
          quoteUsd,
          change24hUsd,
          logo: it.logo_url ?? null,
          address: it.contract_address ?? null,
          chain,
          chainLabel,
          watchChain,
        } satisfies Holding;
      });
  } catch {
    return [];
  }
}

export interface Portfolio {
  items: Holding[];
  totalUsd: number;
  change24hUsd: number;
  dust: Holding[];
  allocations: { chain: string; chainLabel: string; totalUsd: number }[];
}

export async function fetchPortfolio(
  address: string
): Promise<Portfolio | null> {
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  const perChain = await Promise.all(
    LEDGER_CHAINS.map((c) => fetchChainBalances(key, c.id, address))
  );
  const all = perChain.flat().sort((a, b) => b.quoteUsd - a.quoteUsd);

  // Split meaningful holdings from dust so a new user's first small transfer
  // is never reported as "no coin", yet dust does not clutter the table.
  const items = all.filter((it) => it.quoteUsd >= 0.5);
  const dust = all.filter((it) => it.quoteUsd > 0 && it.quoteUsd < 0.5);

  const totalUsd = items.reduce((s, it) => s + it.quoteUsd, 0);
  const change24hUsd = items.reduce((s, it) => s + it.change24hUsd, 0);

  const allocMap = new Map<string, { chainLabel: string; totalUsd: number }>();
  for (const it of items) {
    const cur = allocMap.get(it.chain) ?? {
      chainLabel: it.chainLabel,
      totalUsd: 0,
    };
    cur.totalUsd += it.quoteUsd;
    allocMap.set(it.chain, cur);
  }
  const allocations = Array.from(allocMap.entries())
    .map(([chain, v]) => ({ chain, chainLabel: v.chainLabel, totalUsd: v.totalUsd }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return { items, totalUsd, change24hUsd, dust, allocations };
}
