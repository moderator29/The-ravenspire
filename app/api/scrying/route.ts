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
   cross-chain popularity contest it was never entered into.

   THREE DISTINCT ENDPOINTS, NOT ONE PAGED DEEP. A first pass at this widened
   the top-pools fetch from two pages a chain to five, on the assumption that
   GeckoTerminal's free `pools` listing pages arbitrarily deep. Verified
   against the live site, it did not move the count much past what two pages
   already gave, and reducing it back to three barely moved it either. That
   was diagnosed as GeckoTerminal's own depth limit; it was not. The real
   cause: every page of every endpoint of every chain was requested through
   one `Promise.all`, which fires all of them in the same instant. Seven
   chains times three endpoints times two or three pages each is on the
   order of fifty simultaneous requests to a free, keyless, per-IP-rate-limited
   API, and `fetchGecko` swallows a failed request as "no coins from this
   page" rather than surfacing it, so most of that burst coming back empty
   looked identical to "GeckoTerminal does not have that much data." It was
   never the depth. `runThrottled` below runs the same total request set in
   small staggered waves instead of one burst, and `buildJobs` orders those
   waves breadth-first (every chain's first page of every endpoint before
   any chain's second page), so a wave lost to a rate limit still costs the
   deepest, least valuable pages first rather than starving a chain of
   coverage entirely. This is also why the route now declares
   maxDuration: waves paced to be kind to an upstream free tier take longer
   in wall-clock time than one burst did, in exchange for the burst actually
   working. The route's own 90s fetch cache (below) means this cost is paid
   at most once every 90 seconds platform-wide, not once per visitor. */

export const dynamic = "force-dynamic";
/* Staggered waves (see above) take longer than one burst; comfortably inside
   Vercel's allowed ceiling even on the free tier, and this is a config
   value, not a paid feature. */
export const maxDuration = 60;

const MAX_MARKET_CAP_USD = 100_000_000; // under $100M only, active altcoins
const MIN_LIQUIDITY_USD = 15_000;
const MIN_VOLUME_USD = 15_000;
/* Pages fetched per chain, per endpoint, 20 pools a page. Real depth now that
   the requests are throttled (see the header comment) rather than fired as
   one burst: thinner chains still honestly return fewer coins, because there
   simply are not two hundred liquid non-major altcoins on every chain at
   every moment, and padding that count would mean showing junk pools to hit
   a number. */
const TOP_PAGES = 5;
const NEW_PAGES = 2;
const TRENDING_PAGES = 2;
const PER_CHAIN_CAP = 200;
/* How many addresses get the DexScreener enrichment pass (socials + logo
   fallback + spark) in one request. Raised well past the old 90-coin ceiling
   now that a chain-capped board can genuinely return several hundred coins;
   still bounded so one refresh cannot balloon into an unbounded fan-out. */
const ENRICH_BUDGET = 900;

/* Run `jobs` (lazy thunks, not already-started promises) in small waves of
   at most `concurrency` at a time, pausing `waveDelayMs` between waves. A
   promise passed to Promise.all has already fired its request the moment it
   was created; the whole point here is that nothing fires until its wave's
   turn, which a pre-started promise cannot do. Order matters: jobs earlier
   in the array run in earlier waves, so callers wanting graceful degradation
   under a rate limit should put their most valuable requests first. */
async function runThrottled<T>(
  jobs: (() => Promise<T>)[],
  concurrency: number,
  waveDelayMs: number
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += concurrency) {
    const wave = jobs.slice(i, i + concurrency);
    out.push(...(await Promise.all(wave.map((job) => job()))));
    if (i + concurrency < jobs.length) {
      await new Promise((resolve) => setTimeout(resolve, waveDelayMs));
    }
  }
  return out;
}

/* Gentle enough for a free, keyless, per-IP-limited API; see the header
   comment for why this replaced one 49-to-84-wide Promise.all burst. */
const GECKO_CONCURRENCY = 6;
const GECKO_WAVE_DELAY_MS = 700;
/* DexScreener's batched token endpoint is comfortably more generous, and a
   miss here only costs a logo, socials or a spark line, never a coin
   disappearing from the count, so this stays lighter-touch than the
   GeckoTerminal throttle above. */
const ENRICH_CONCURRENCY = 10;
const ENRICH_WAVE_DELAY_MS = 400;

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

  await runThrottled(
    chunks.map((chunk) => async () => {
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
    }),
    ENRICH_CONCURRENCY,
    ENRICH_WAVE_DELAY_MS
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

interface GeckoJob {
  target: "top" | "trending";
  run: () => Promise<ScryCoin[]>;
}

/* Breadth-first, not chain-by-chain: every chain's page 1 of every endpoint
   comes before any chain's page 2, so a wave lost further down the run (a
   rate limit, a slow upstream) costs the deepest, least valuable pages
   first rather than starving one chain of coverage while another gets its
   full depth. See the header comment for why this replaced one flat burst. */
function buildJobs(nets: string[]): GeckoJob[] {
  const maxPages = Math.max(TOP_PAGES, NEW_PAGES, TRENDING_PAGES);
  const jobs: GeckoJob[] = [];
  for (let page = 1; page <= maxPages; page++) {
    for (const net of nets) {
      if (page <= TOP_PAGES) {
        jobs.push({
          target: "top",
          run: () =>
            fetchGecko(`networks/${net}/pools?include=base_token&page=${page}`, net),
        });
      }
      if (page <= NEW_PAGES) {
        jobs.push({
          target: "top",
          run: () =>
            fetchGecko(
              `networks/${net}/new_pools?include=base_token&page=${page}`,
              net
            ),
        });
      }
      if (page <= TRENDING_PAGES) {
        jobs.push({
          target: "trending",
          run: () =>
            fetchGecko(
              `networks/${net}/trending_pools?include=base_token&page=${page}`,
              net
            ),
        });
      }
    }
  }
  return jobs;
}

async function scry() {
  const nets = TRADE_CHAINS.map((c) => c.gecko);
  const jobs = buildJobs(nets);
  const results = await runThrottled(
    jobs.map((j) => async () => ({ target: j.target, coins: await j.run() })),
    GECKO_CONCURRENCY,
    GECKO_WAVE_DELAY_MS
  );

  const topAll = dedupeBest(
    results.filter((r) => r.target === "top").flatMap((r) => r.coins)
  );
  const trendAll = dedupeBest(
    results.filter((r) => r.target === "trending").flatMap((r) => r.coins)
  );

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
