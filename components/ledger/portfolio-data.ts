import type { WalletToken } from "@/components/wallet/wallet-token-types";

/* Pure aggregation over the multi-chain balances route
   (app/api/wallet/balances -> WalletToken[]). No server imports, no network:
   every number here is derived from the member's real on-chain balances. We
   never fabricate history; the only time dimension we surface is the 24h rate
   move the provider already gives us per token. */

export interface Position extends WalletToken {
  /* USD gained/lost over 24h, derived from this token's value and its
     provider 24h percentage. Honest: it is a rate move, not a trade record. */
  change24hUsd: number;
}

export interface AllocSlice {
  label: string;
  value: number;
  pct: number;
  color: string;
}

export interface Portfolio {
  positions: Position[];
  dust: Position[];
  totalUsd: number;
  change24hUsd: number;
  changePct: number;
  /* Total 24h ago, derived as (now - 24h change). A second real data point,
     not invented history. */
  prevTotalUsd: number;
  byAsset: AllocSlice[];
  byChain: AllocSlice[];
}

/* Gold and ember only, brightest to deepest. No green anywhere by design. */
export const ALLOC_PALETTE = [
  "var(--gold-bright)",
  "var(--gold)",
  "var(--gold-rich)",
  "var(--gold-deep)",
  "var(--ember)",
  "var(--ember-deep)",
  "var(--bone-mut)",
];

/* Below this USD value a holding is treated as dust and tucked behind a
   toggle so a stray airdrop never clutters the real picture. */
export const DUST_MAX_USD = 1;

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdWholeFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function usd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return usdFmt.format(n);
}

/* Large headline figures read cleaner without cents. */
export function usdWhole(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return Math.abs(n) >= 1000 ? usdWholeFmt.format(n) : usdFmt.format(n);
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/* USD moved over 24h for a single token. quoteUsd is the value now; the
   provider percentage lets us recover the value 24h ago and subtract. Guarded
   against the -100% edge that would divide by zero. */
function tokenChangeUsd(t: WalletToken): number {
  const p = t.change24h / 100;
  if (!Number.isFinite(p) || p <= -0.999) return 0;
  const prev = t.quoteUsd / (1 + p);
  const d = t.quoteUsd - prev;
  return Number.isFinite(d) ? d : 0;
}

function groupSlices(
  items: Position[],
  keyFn: (t: Position) => string,
  total: number
): AllocSlice[] {
  const map = new Map<string, number>();
  for (const t of items) {
    const k = keyFn(t);
    map.set(k, (map.get(k) ?? 0) + t.quoteUsd);
  }
  const entries = [...map.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const MAX = 6;
  let sliced: [string, number][] = entries;
  if (entries.length > MAX) {
    const head = entries.slice(0, MAX - 1);
    const otherVal = entries
      .slice(MAX - 1)
      .reduce((s, [, v]) => s + v, 0);
    sliced = [...head, ["Other", otherVal]];
  }

  return sliced.map(([label, value], i) => ({
    label,
    value,
    pct: total > 0 ? (value / total) * 100 : 0,
    color: ALLOC_PALETTE[i % ALLOC_PALETTE.length],
  }));
}

export function buildPortfolio(tokens: WalletToken[]): Portfolio {
  const withChange: Position[] = tokens.map((t) => ({
    ...t,
    change24hUsd: tokenChangeUsd(t),
  }));

  /* Keep anything with real value or a real balance; drop empty natives the
     route always returns (0 balance, 0 value) so they never pad the list. */
  const held = withChange.filter(
    (t) => t.quoteUsd > 0 || t.balanceRaw !== "0"
  );

  const positions = held
    .filter((t) => t.quoteUsd >= DUST_MAX_USD)
    .sort((a, b) => b.quoteUsd - a.quoteUsd);

  const dust = held
    .filter((t) => t.quoteUsd < DUST_MAX_USD)
    .sort((a, b) => b.quoteUsd - a.quoteUsd);

  const totalUsd = positions.reduce((s, t) => s + t.quoteUsd, 0);
  const change24hUsd = positions.reduce((s, t) => s + t.change24hUsd, 0);
  const prevTotalUsd = totalUsd - change24hUsd;
  const changePct = prevTotalUsd > 0 ? (change24hUsd / prevTotalUsd) * 100 : 0;

  return {
    positions,
    dust,
    totalUsd,
    change24hUsd,
    changePct,
    prevTotalUsd,
    byAsset: groupSlices(positions, (t) => t.symbol, totalUsd),
    byChain: groupSlices(positions, (t) => t.chainName, totalUsd),
  };
}
