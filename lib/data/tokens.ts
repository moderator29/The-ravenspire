import "server-only";

/* Keyless, real market data from DexScreener with a small bounded cache.
   Never fabricated; when the well is dry, or the match is not trustworthy,
   we return null and the UI says so. */

export interface TokenCard {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  marketCapIsFdv: boolean;
  liquidityUsd: number | null;
  chain: string | null;
  address: string | null;
  url: string | null;
  fetchedAt: number;
}

/* Cashtags for tokens that do not trade yet. A scammer can name an impostor
   token after these to hijack the lookup, so we refuse to render a card for
   them until the real token exists. */
const BLOCKED_SYMBOLS = new Set(["raven"]);

/* Below this DEX liquidity a price is too easily manipulated to present as
   authoritative alongside Calls and Verdicts. */
const MIN_LIQUIDITY_USD = 10_000;

const TTL_MS = 60_000;
const MAX_ENTRIES = 300;

interface CacheEntry {
  card: TokenCard | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();

function cacheGet(q: string): CacheEntry | undefined {
  const e = cache.get(q);
  if (!e) return undefined;
  // Refresh LRU recency.
  cache.delete(q);
  cache.set(q, e);
  return e;
}

function cacheSet(q: string, card: TokenCard | null) {
  cache.set(q, { card, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

interface DexPair {
  baseToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  chainId?: string;
  url?: string;
  liquidity?: { usd?: number };
}

export async function lookupToken(query: string): Promise<TokenCard | null> {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  if (!q) return null;
  if (BLOCKED_SYMBOLS.has(q)) return null;

  const cached = cacheGet(q);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.card;

  const isAddress = /^0x[a-f0-9]{40}$/.test(q);

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { pairs?: DexPair[] };
    const allPairs = body.pairs ?? [];

    // Only accept a trustworthy match:
    //  - address queries: the base token address must match exactly;
    //  - symbol queries: the base token symbol must match exactly. No
    //    highest-liquidity "closest guess" fallback, which renders a
    //    confidently wrong token.
    const matches = allPairs
      .filter((p) => {
        if (isAddress) return p.baseToken?.address?.toLowerCase() === q;
        return p.baseToken?.symbol?.toLowerCase() === q;
      })
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

    const p = matches[0];
    // Enforce a liquidity floor so zero-liquidity impostor pairs cannot mint
    // an authoritative-looking price card.
    if (
      !p ||
      !p.baseToken?.symbol ||
      (p.liquidity?.usd ?? 0) < MIN_LIQUIDITY_USD
    ) {
      cacheSet(q, null);
      return null;
    }

    const hasRealMcap = typeof p.marketCap === "number" && p.marketCap > 0;
    const card: TokenCard = {
      symbol: p.baseToken.symbol.toUpperCase(),
      name: p.baseToken.name ?? p.baseToken.symbol,
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      change24h: p.priceChange?.h24 ?? null,
      volume24h: p.volume?.h24 ?? null,
      marketCap: hasRealMcap ? (p.marketCap as number) : (p.fdv ?? null),
      marketCapIsFdv: !hasRealMcap && typeof p.fdv === "number",
      liquidityUsd: p.liquidity?.usd ?? null,
      chain: p.chainId ?? null,
      address: p.baseToken.address ?? null,
      url: p.url ?? null,
      fetchedAt: Date.now(),
    };
    cacheSet(q, card);
    return card;
  } catch {
    // Do not serve unbounded stale data; a fresh cached value (within TTL) is
    // already returned above, so on error we answer honestly with null.
    return null;
  }
}

export function describeTokenForRaven(card: TokenCard): string {
  const parts = [
    `Token ${card.symbol} (${card.name})`,
    card.priceUsd !== null ? `price $${card.priceUsd}` : "price unknown",
    card.change24h !== null ? `24h change ${card.change24h}%` : "",
    card.marketCap !== null
      ? `${card.marketCapIsFdv ? "FDV" : "market cap"} $${Math.round(card.marketCap)}`
      : "",
    card.volume24h !== null ? `24h volume $${Math.round(card.volume24h)}` : "",
    card.chain ? `chain ${card.chain}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}
