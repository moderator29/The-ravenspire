import { json } from "@/lib/auth/server";
import { TRADE_CHAINS, tradeChainByGecko } from "@/lib/trade/config";
import { chainLogo } from "@/lib/trade/token-list";

/* THE SCRYING GLASS — live altcoin discovery.

   The glass surfaces coins members can actually act on: real, actively-traded
   EVM tokens UNDER $100M market cap, drawn live from GeckoTerminal's trending
   and top pools across every chain we trade. Majors, stablecoins and wrapped
   natives are filtered OUT — the point is active altcoins and memecoins, not
   USDC/ETH. Everything returned is swappable in-app through the 0x route.

   Three lenses (tabs):
     - heating : biggest 24h gainers among liquid, active coins
     - trending: what the market is rotating into right now (trending pools)
     - top     : the deepest, highest-volume markets under the cap

   Socials (site / X / Telegram) are enriched in one batched DexScreener call
   so the glass carries a coin's links without a per-token fan-out. Keyless,
   cached server-side. Real data only; unreachable chains are omitted. */

export const dynamic = "force-dynamic";

const MAX_MARKET_CAP_USD = 100_000_000; // under $100M only — active altcoins
const MIN_LIQUIDITY_USD = 15_000;
const MIN_VOLUME_USD = 15_000;
const PER_TAB = 40;

/* Never surfaced: stablecoins, wrapped natives, and the majors themselves.
   These are not the discovery target and only crowd out real altcoins. */
const EXCLUDE_SYMBOLS = new Set([
  "USDC", "USDT", "DAI", "BUSD", "TUSD", "USDD", "FDUSD", "USDE", "SUSDE",
  "FRAX", "LUSD", "USDP", "GUSD", "PYUSD", "EURC", "USDC.E", "USDBC", "CRVUSD",
  "USDL", "USDX", "GHO", "DOLA", "MIM", "USD+", "AUSD", "USDS",
  "WETH", "WBTC", "WBNB", "WAVAX", "WMATIC", "WPOL", "WSOL", "CBBTC",
  "CBETH", "WSTETH", "STETH", "RETH", "WEETH", "EZETH", "RSETH", "WBETH",
  "ETH", "BTC", "BNB", "AVAX", "MATIC", "POL", "TBTC",
]);

interface GeckoPool {
  id?: string;
  attributes?: {
    name?: string;
    base_token_price_usd?: string | null;
    reserve_in_usd?: string | null;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    volume_usd?: { h24?: string | null };
    price_change_percentage?: { h24?: string | null };
  };
  relationships?: { base_token?: { data?: { id?: string } } };
}

interface GeckoIncluded {
  id?: string;
  type?: string;
  attributes?: {
    symbol?: string;
    name?: string;
    address?: string;
    image_url?: string | null;
  };
}

export interface ScryCoin {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number;
  marketCap: number | null;
  fdv: number | null;
  chainId: number;
  chainName: string;
  chainShort: string;
  chainLogo: string | null;
  network: string;
  watchChain: string | null;
  logo: string | null;
  address: string;
  url: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  /* A real micro-trend: the coin's price reconstructed at 24h/6h/1h/now from
     DexScreener's price-change buckets, oldest→newest. Drives the row spark. */
  spark: number[] | null;
}

function cleanLogo(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.toLowerCase().includes("missing")) return null;
  return src;
}

/* Map one GeckoTerminal pools response (top or trending) into coins. */
function mapPools(
  networkId: string,
  body: { data?: GeckoPool[]; included?: GeckoIncluded[] }
): ScryCoin[] {
  const tokens = new Map<string, GeckoIncluded>();
  for (const inc of body.included ?? []) {
    if (inc.type === "token" && inc.id) tokens.set(inc.id, inc);
  }
  const chain = tradeChainByGecko(networkId);
  if (!chain) return [];

  const out: ScryCoin[] = [];
  for (const pool of body.data ?? []) {
    const a = pool.attributes ?? {};
    const baseId = pool.relationships?.base_token?.data?.id ?? "";
    const base = tokens.get(baseId);
    const address = base?.attributes?.address ?? "";
    if (!address) continue;

    const symbol = (base?.attributes?.symbol ?? "?").toUpperCase();
    if (EXCLUDE_SYMBOLS.has(symbol)) continue;

    const liquidity = Number(a.reserve_in_usd ?? 0);
    const volume = a.volume_usd?.h24 ? Number(a.volume_usd.h24) : 0;
    const marketCap = a.market_cap_usd ? Number(a.market_cap_usd) : null;
    const fdv = a.fdv_usd ? Number(a.fdv_usd) : null;
    const cap = marketCap ?? fdv ?? 0;

    // Active + tradable + genuinely small-cap only.
    if (liquidity < MIN_LIQUIDITY_USD) continue;
    if (volume < MIN_VOLUME_USD) continue;
    if (cap <= 0 || cap > MAX_MARKET_CAP_USD) continue;

    out.push({
      symbol,
      name: base?.attributes?.name ?? a.name ?? "Unknown",
      priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : null,
      change24h: a.price_change_percentage?.h24
        ? Number(a.price_change_percentage.h24)
        : null,
      volume24h: volume,
      liquidityUsd: liquidity,
      marketCap,
      fdv,
      chainId: chain.id,
      chainName: chain.name,
      chainShort: chain.short,
      chainLogo: chainLogo(chain.id),
      network: networkId,
      watchChain: String(chain.id),
      logo: cleanLogo(base?.attributes?.image_url),
      address,
      url: `https://www.geckoterminal.com/${networkId}/pools/${
        pool.id?.split("_").slice(1).join("_") ?? ""
      }`,
      website: null,
      twitter: null,
      telegram: null,
      spark: null,
    });
  }
  return out;
}

async function fetchGecko(path: string, networkId: string): Promise<ScryCoin[]> {
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 90 },
    });
    if (!res.ok) return [];
    return mapPools(networkId, await res.json());
  } catch {
    return [];
  }
}

/* One batched DexScreener call (up to 30 addresses) enriches socials AND a
   real price micro-trend per address, in a single request. */
interface DexSocial { type?: string; url?: string }
interface DexWebsite { label?: string; url?: string }
interface DexPair {
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  info?: { websites?: DexWebsite[]; socials?: DexSocial[] };
}

interface Enrichment {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  spark: number[] | null;
}

/* Reconstruct a 24h→now price path from the current price and the percentage
   change over each window: pₜ = price / (1 + changeₜ%). Real data, no fetch. */
function buildSpark(
  price: number,
  ch?: { m5?: number; h1?: number; h6?: number; h24?: number }
): number[] | null {
  if (!Number.isFinite(price) || price <= 0 || !ch) return null;
  const at = (pct?: number) =>
    typeof pct === "number" && Number.isFinite(pct) ? price / (1 + pct / 100) : price;
  const pts = [at(ch.h24), at(ch.h6), at(ch.h1), at(ch.m5), price];
  return pts.every((p) => Number.isFinite(p) && p > 0) ? pts : null;
}

async function enrichFor(addresses: string[]): Promise<Map<string, Enrichment>> {
  const map = new Map<string, Enrichment>();
  const bestLiq = new Map<string, number>();
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
          { next: { revalidate: 120 } }
        );
        if (!res.ok) return;
        const body = (await res.json()) as { pairs?: DexPair[] | null };
        for (const p of body.pairs ?? []) {
          const addr = p.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          // Keep the deepest pair per token for the truest trend + links.
          const liq = p.liquidity?.usd ?? 0;
          if (map.has(addr) && (bestLiq.get(addr) ?? 0) >= liq) continue;
          bestLiq.set(addr, liq);

          const socials = p.info?.socials ?? [];
          map.set(addr, {
            website: p.info?.websites?.[0]?.url ?? null,
            twitter: socials.find((s) => s.type === "twitter")?.url ?? null,
            telegram: socials.find((s) => s.type === "telegram")?.url ?? null,
            spark: buildSpark(Number(p.priceUsd ?? 0), p.priceChange),
          });
        }
      } catch {
        /* enrichment is best-effort; a miss leaves links + spark empty */
      }
    })
  );
  return map;
}

function dedupeBest(coins: ScryCoin[]): Map<string, ScryCoin> {
  const best = new Map<string, ScryCoin>();
  for (const c of coins) {
    const key = `${c.chainId}:${c.address.toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || c.liquidityUsd > prev.liquidityUsd) best.set(key, c);
  }
  return best;
}

async function scry() {
  const nets = TRADE_CHAINS.map((c) => c.gecko);
  const jobs: Promise<ScryCoin[]>[] = [];
  const trendingJobs: Promise<ScryCoin[]>[] = [];
  for (const net of nets) {
    // Top pools (two pages) feed "top" and "heating"; trending feeds "trending".
    jobs.push(fetchGecko(`networks/${net}/pools?include=base_token&page=1`, net));
    jobs.push(fetchGecko(`networks/${net}/pools?include=base_token&page=2`, net));
    trendingJobs.push(
      fetchGecko(`networks/${net}/trending_pools?include=base_token`, net)
    );
  }

  const [topBatches, trendBatches] = await Promise.all([
    Promise.all(jobs),
    Promise.all(trendingJobs),
  ]);

  const topAll = dedupeBest(topBatches.flat());
  const trendAll = dedupeBest(trendBatches.flat());

  if (topAll.size === 0 && trendAll.size === 0)
    return { heating: [], trending: [], top: [], error: "unreachable" as const };

  const topList = [...topAll.values()];

  const top = [...topList]
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, PER_TAB);

  const heating = [...topList]
    .filter((c) => (c.change24h ?? 0) > 0)
    .sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0))
    .slice(0, PER_TAB);

  // Trending falls back to top-by-volume if the trending endpoints were thin.
  const trendingSource = trendAll.size > 0 ? [...trendAll.values()] : topList;
  const trending = trendingSource
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, PER_TAB);

  // Enrich socials + spark once for the union of everything we're returning.
  const union = new Map<string, ScryCoin>();
  for (const c of [...heating, ...trending, ...top])
    union.set(c.address.toLowerCase(), c);
  const enrich = await enrichFor([...union.keys()].slice(0, 90));

  const apply = (list: ScryCoin[]) =>
    list.map((c) => {
      const e = enrich.get(c.address.toLowerCase());
      return e ? { ...c, ...e } : c;
    });

  return {
    heating: apply(heating),
    trending: apply(trending),
    top: apply(top),
  };
}

export async function GET() {
  return json(await scry());
}
