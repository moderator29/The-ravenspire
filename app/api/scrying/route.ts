import { getProfile, json } from "@/lib/auth/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { TRADE_CHAINS, tradeChainByGecko } from "@/lib/trade/config";
import { chainLogo } from "@/lib/trade/token-list";

/* THE SCRYING GLASS, live altcoin discovery.

   The glass surfaces coins members can actually act on: real, actively-traded
   EVM tokens UNDER $100M market cap, drawn live from GeckoTerminal's trending
   and top pools across every chain we trade. Majors, stablecoins and wrapped
   natives are filtered OUT, the point is active altcoins and memecoins, not
   USDC/ETH. Everything returned is swappable in-app through the 0x route.

   Three lenses (tabs):
     - heating : biggest 24h gainers among liquid, active coins
     - trending: what the market is rotating into right now (trending pools)
     - top     : the deepest, highest-volume markets under the cap

   Socials (site / X / Telegram) AND a logo fallback are enriched in one
   batched DexScreener call so the glass carries a coin's links and a real
   picture without a per-token fan-out. Keyless, cached server-side. Real
   data only; unreachable chains are omitted, never padded with anything
   invented.

   PER-CHAIN DEPTH, NOT ONE SHARED SLICE. This used to fetch two pages of top
   pools per chain and cap every lens at 40 coins TOTAL across all seven
   chains combined, sorted and sliced once. A chain with thinner but real
   volume (Ethereum's own altcoins, next to BNB Chain's much higher pool
   count) lost that fight before a member ever opened the chain filter: BNB
   Chain's own coins alone could fill all 40 slots, so selecting "Ethereum"
   client-side against that already-tiny shared list left three or four rows.
   Each chain now earns its own top slice of up to PER_CHAIN_CAP coins by the
   lens's own metric, and the chains are combined after, so a chain filter
   shows what that chain actually has rather than what survived a
   cross-chain popularity contest it was never entered into. */

export const dynamic = "force-dynamic";

const MAX_MARKET_CAP_USD = 100_000_000; // under $100M only, active altcoins
const MIN_LIQUIDITY_USD = 15_000;
const MIN_VOLUME_USD = 15_000;
/* Pages of GeckoTerminal's top-pools and trending-pools endpoints fetched per
   chain, 20 pools a page. Five top-pool pages is up to 100 raw candidates a
   chain before any filter runs; real chains with real liquidity comfortably
   clear a hundred qualifying coins from that, thinner chains honestly return
   fewer, because there simply are not two hundred liquid non-major altcoins
   on every chain at every moment and padding that count would mean showing
   junk pools to hit a number. */
const TOP_PAGES = 5;
const TRENDING_PAGES = 2;
const PER_CHAIN_CAP = 200;
/* How many addresses get the DexScreener enrichment pass (socials + logo
   fallback + spark) in one request. Raised well past the old 90-coin ceiling
   now that a chain-capped board can genuinely return several hundred coins;
   still bounded so one refresh cannot balloon into an unbounded fan-out. */
const ENRICH_BUDGET = 900;

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
  info?: { imageUrl?: string; websites?: DexWebsite[]; socials?: DexSocial[] };
}

interface Enrichment {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  spark: number[] | null;
  /* DexScreener's own token image, used only when GeckoTerminal gave none.
     GeckoTerminal's `image_url` is absent or "missing.png" for a large share
     of BNB Chain pools specifically, which is exactly the "BNB coins not
     showing a logo" gap: a second real source beats leaving the row to the
     TokenLogo primitive's own letter-glyph fallback. */
  logo: string | null;
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
            logo: cleanLogo(p.info?.imageUrl),
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

/* Groups a list by chain, sorts each chain's own group by its own metric,
   then takes that chain's own top `cap` before rejoining every chain back
   into one list. A shared global sort-then-slice is what let one high-volume
   chain crowd out every other chain's real coins before a member ever opened
   the chain filter; this is the fix, and it is the whole fix, everything
   downstream (the lens sort for display, enrichment, the response shape)
   is unchanged. */
function perChainTop(
  coins: ScryCoin[],
  metric: (c: ScryCoin) => number,
  cap: number
): ScryCoin[] {
  const byChain = new Map<number, ScryCoin[]>();
  for (const c of coins) {
    const arr = byChain.get(c.chainId);
    if (arr) arr.push(c);
    else byChain.set(c.chainId, [c]);
  }
  const out: ScryCoin[] = [];
  for (const arr of byChain.values()) {
    out.push(...[...arr].sort((a, b) => metric(b) - metric(a)).slice(0, cap));
  }
  return out;
}

async function scry() {
  const nets = TRADE_CHAINS.map((c) => c.gecko);
  const jobs: Promise<ScryCoin[]>[] = [];
  const trendingJobs: Promise<ScryCoin[]>[] = [];
  for (const net of nets) {
    // Top pools feed "top" and "heating"; trending pools feed "trending".
    // TOP_PAGES/TRENDING_PAGES pages a chain, 20 pools a page, so each chain
    // gets its own real shot at PER_CHAIN_CAP qualifying coins rather than
    // the two-page, forty-total-across-every-chain ceiling this used to run
    // under.
    for (let page = 1; page <= TOP_PAGES; page++) {
      jobs.push(
        fetchGecko(`networks/${net}/pools?include=base_token&page=${page}`, net)
      );
    }
    for (let page = 1; page <= TRENDING_PAGES; page++) {
      trendingJobs.push(
        fetchGecko(
          `networks/${net}/trending_pools?include=base_token&page=${page}`,
          net
        )
      );
    }
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

  const top = perChainTop(topList, (c) => c.volume24h ?? 0, PER_CHAIN_CAP).sort(
    (a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)
  );

  const heating = perChainTop(
    topList.filter((c) => (c.change24h ?? 0) > 0),
    (c) => c.change24h ?? 0,
    PER_CHAIN_CAP
  ).sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));

  // Trending falls back to top-by-volume if the trending endpoints were thin,
  // per chain: a chain whose trending_pools came back empty still gets its
  // own top-by-volume coins rather than losing its slice to whichever chains
  // did have trending data.
  const chainsWithTrending = new Set([...trendAll.values()].map((c) => c.chainId));
  const trendingSource: ScryCoin[] = [
    ...trendAll.values(),
    ...topList.filter((c) => !chainsWithTrending.has(c.chainId)),
  ];
  const trending = perChainTop(
    trendingSource,
    (c) => c.volume24h ?? 0,
    PER_CHAIN_CAP
  ).sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));

  // Enrich socials + a logo fallback + spark once for the union of everything
  // we're returning, keyed the same way the board itself dedupes: a coin can
  // legitimately share an address across chains, so chain is part of the key.
  const union = new Map<string, ScryCoin>();
  for (const c of [...heating, ...trending, ...top])
    union.set(`${c.chainId}:${c.address.toLowerCase()}`, c);
  const enrich = await enrichFor(
    [...new Set([...union.values()].map((c) => c.address))].slice(
      0,
      ENRICH_BUDGET
    )
  );

  const apply = (list: ScryCoin[]) =>
    list.map((c) => {
      const e = enrich.get(c.address.toLowerCase());
      if (!e) return c;
      // c.logo wins when GeckoTerminal already gave a real one; e.logo is
      // strictly a fallback for when it did not, never an overwrite of a
      // logo that already works.
      return { ...c, ...e, logo: c.logo ?? e.logo };
    });

  return {
    heating: apply(heating),
    trending: apply(trending),
    top: apply(top),
  };
}

/* C4: one call to the glass fans out to two GeckoTerminal pages per chain plus
   a trending page per chain, then batched DexScreener enrichment on top. It is
   the heaviest request in the app and it stays open to visitors, so it is
   metered: on the account when someone is signed in, on the address when they
   are not. The glass refreshes itself every 60s while open, so both ceilings
   sit well above an hour of honest watching; a shared address is the reason
   the signed-out bucket is not tighter still. */
export async function GET(req: Request) {
  const profile = await getProfile(req);
  const rl = await rateLimit(
    callerKey("scrying", req, profile?.id),
    profile ? 300 : 150,
    3600
  );
  if (!rl.ok)
    return json(
      {
        heating: [],
        trending: [],
        top: [],
        error: "rate_limited" as const,
        retryAfter: rl.retryAfter,
      },
      429
    );
  return json(await scry());
}
