import "server-only";
import {
  EVM_DEX_CHAINS,
  isEvmGeckoNetwork,
  tradeChainByGecko,
} from "@/lib/trade/config";

/* Keyless, real market data with a small bounded cache. Two sources, chosen so
   the Raven never quotes a fake price:
     - Majors and blue chips (ETH, BTC, BNB, USDC, LINK, UNI…) resolve through
       CoinGecko, the canonical price, so "$eth" is real Ether and never a
       Solana impostor named ETH.
     - Everything else resolves through DexScreener, restricted to the EVM
       chains the realm trades, Solana and other non-EVM results are dropped , 
       with an exact-symbol + liquidity floor so an impostor can't mint a card.
   Never fabricated; when the match is not trustworthy we return null. */

/* symbol -> CoinGecko id for the coins members ask about by name.

   Exported because a Call has to pin the identity it was sealed against rather
   than re-resolving the ticker at settlement time (V2 finding P3). A major has
   no single contract address, so its canonical identity is this id, and this
   map is a fixed curated list that no impostor can enter. */
export const COINGECKO_IDS: Record<string, string> = {
  eth: "ethereum",
  weth: "weth",
  btc: "bitcoin",
  wbtc: "wrapped-bitcoin",
  cbbtc: "coinbase-wrapped-btc",
  bnb: "binancecoin",
  wbnb: "wbnb",
  sol: "solana",
  avax: "avalanche-2",
  wavax: "wrapped-avax",
  matic: "matic-network",
  pol: "polygon-ecosystem-token",
  usdc: "usd-coin",
  usdt: "tether",
  dai: "dai",
  arb: "arbitrum",
  op: "optimism",
  link: "chainlink",
  uni: "uniswap",
  aave: "aave",
  mkr: "maker",
  ldo: "lido-dao",
  crv: "curve-dao-token",
  pepe: "pepe",
  shib: "shiba-inu",
  ena: "ethena",
  ondo: "ondo-finance",
};

const CG_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  bitcoin: "bitcoin",
  binancecoin: "bsc",
  solana: "solana",
  "avalanche-2": "avalanche",
  "matic-network": "polygon",
  "polygon-ecosystem-token": "polygon",
};

interface CoinGeckoPrice {
  usd?: number;
  usd_24h_change?: number;
  usd_24h_vol?: number;
  usd_market_cap?: number;
}

/* CoinGecko's free Demo tier is keyless by design, but a configured key lifts
   the request straight from the shared, easily exhausted anonymous rate limit
   onto this realm's own. Every fetch to api.coingecko.com anywhere in the
   product sends this, not only the one call site that originally grew it:
   a member's own real BTC or ETH Call failing with "cannot measure that
   token's volatility" because some other request on the anonymous limit used
   it up first is not a data gap, it is this header missing from a sibling
   function. */
export function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }
  return headers;
}

async function lookupMajor(symbol: string): Promise<TokenCard | null> {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { headers: cgHeaders(), next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, CoinGeckoPrice>;
    const d = body[id];
    if (!d || typeof d.usd !== "number") return null;
    return {
      symbol: symbol.toUpperCase(),
      name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      priceUsd: d.usd,
      change24h: typeof d.usd_24h_change === "number" ? d.usd_24h_change : null,
      volume24h: typeof d.usd_24h_vol === "number" ? d.usd_24h_vol : null,
      marketCap: typeof d.usd_market_cap === "number" ? d.usd_market_cap : null,
      marketCapIsFdv: false,
      liquidityUsd: null,
      chain: CG_CHAIN[id] ?? "ethereum",
      address: null,
      coingeckoId: id,
      url: `https://www.coingecko.com/en/coins/${id}`,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

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
  /* CoinGecko's own canonical id, when this card resolved through CoinGecko
     (the curated majors map below, or the broad symbol search further down).
     A Call pins its identity from this directly rather than re-deriving it
     from the symbol at seal time (see lib/calls/resolvers/price.ts's
     pinSubject), so a token found only through the broad search still gets a
     real, non-guessable identity to settle against later. Null for a card
     that resolved through an EVM DEX pool instead, which pins on chain +
     address. */
  coingeckoId: string | null;
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

interface GeckoTerminalToken {
  id?: string;
  attributes?: {
    name?: string;
    symbol?: string;
    address?: string;
    price_usd?: string | null;
    volume_usd?: { h24?: string | null } | null;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    total_reserve_in_usd?: string | null;
  };
}

function num(v: string | null | undefined): number | null {
  if (typeof v !== "string" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* GeckoTerminal, the CoinGecko network's own on-chain index.
 *
 * Searched across the EVM networks the realm trades, never Solana or another
 * non-EVM chain, which is the same rule the DexScreener path enforces and for
 * the same reason: a Solana impostor sharing a symbol with an EVM token must
 * never mint an authoritative card.
 *
 * The 24h change is deliberately left null. This endpoint returns price,
 * volume, market cap and FDV per token but not a 24h price change, and a card
 * that showed no change would be read as "flat" rather than as "unknown".
 * Null is the honest value, and the caller renders it as unknown. */
async function lookupGeckoTerminal(
  q: string,
  isAddress: boolean
): Promise<TokenCard | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(q)}&page=1`,
      {
        headers: { accept: "application/json;version=20230302" },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{
        attributes?: {
          name?: string;
          base_token_price_usd?: string | null;
          price_change_percentage?: { h24?: string | null } | null;
          volume_usd?: { h24?: string | null } | null;
          reserve_in_usd?: string | null;
          market_cap_usd?: string | null;
          fdv_usd?: string | null;
        };
        relationships?: {
          base_token?: { data?: { id?: string } };
          network?: { data?: { id?: string } };
        };
      }>;
      included?: GeckoTerminalToken[];
    };

    const pools = body.data ?? [];
    const included = body.included ?? [];

    for (const pool of pools) {
      const networkSlug = pool.relationships?.network?.data?.id;
      if (!networkSlug || !isEvmGeckoNetwork(networkSlug)) continue;

      const chain = tradeChainByGecko(networkSlug);
      if (!chain) continue;

      /* The base token id is "<network>_<address>", which is how the address
         is recovered without a second request. */
      const baseId = pool.relationships?.base_token?.data?.id ?? "";
      const address = baseId.includes("_")
        ? baseId.slice(baseId.indexOf("_") + 1).toLowerCase()
        : "";
      const token = included.find((t) => t.id === baseId);
      const symbol = token?.attributes?.symbol ?? "";

      /* Exact match only, same rule as the DexScreener path. */
      const matches = isAddress
        ? address === q
        : symbol.toLowerCase() === q;
      if (!matches || !symbol) continue;

      const liquidity = num(pool.attributes?.reserve_in_usd ?? null);
      if ((liquidity ?? 0) < MIN_LIQUIDITY_USD) continue;

      const mcap = num(pool.attributes?.market_cap_usd ?? null);
      const fdv = num(pool.attributes?.fdv_usd ?? null);
      const price = num(pool.attributes?.base_token_price_usd ?? null);
      if (price === null) continue;

      return {
        symbol: symbol.toUpperCase(),
        name: token?.attributes?.name ?? symbol,
        priceUsd: price,
        change24h: num(pool.attributes?.price_change_percentage?.h24 ?? null),
        volume24h: num(pool.attributes?.volume_usd?.h24 ?? null),
        marketCap: mcap ?? fdv,
        marketCapIsFdv: mcap === null && fdv !== null,
        liquidityUsd: liquidity,
        chain: chain.dex,
        address: address || null,
        coingeckoId: null,
        url: `https://www.geckoterminal.com/${networkSlug}/pools/${pool.relationships?.base_token?.data?.id ?? ""}`,
        fetchedAt: Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupDexScreenerEvm(
  q: string,
  isAddress: boolean
): Promise<TokenCard | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { pairs?: DexPair[] };
    const allPairs = body.pairs ?? [];

    // Only accept a trustworthy match:
    //  - address queries: the base token address must match exactly;
    //  - symbol queries: the base token symbol must match exactly. No
    //    highest-liquidity "closest guess" fallback, which renders a
    //    confidently wrong token.
    const matches = allPairs
      // EVM chains only, the realm never trades Solana or other non-EVM coins,
      // and dropping them here is what keeps a Solana impostor out of the card.
      .filter((p) => p.chainId && EVM_DEX_CHAINS.has(p.chainId))
      .filter((p) => {
        if (isAddress) return p.baseToken?.address?.toLowerCase() === q;
        return p.baseToken?.symbol?.toLowerCase() === q;
      })
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

    const p = matches[0];
    // Enforce a liquidity floor so zero-liquidity impostor pairs cannot mint
    // an authoritative-looking price card.
    if (!p || !p.baseToken?.symbol || (p.liquidity?.usd ?? 0) < MIN_LIQUIDITY_USD) {
      return null;
    }

    const hasRealMcap = typeof p.marketCap === "number" && p.marketCap > 0;
    return {
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
      coingeckoId: null,
      url: p.url ?? null,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}


interface CoinGeckoSearchCoin {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
}

/* The realm trades EVM chains only, but a Call is a claim about a price, not
   an order the realm has to fill, so it is not bound by that restriction: a
   member asking about TRUMP, DOGE, or anything else genuinely real should be
   able to seal a Call on it even though none of it has meaningful EVM DEX
   liquidity for this platform's Swap to route through. This is the broad
   catch-all after the curated majors map and both EVM DEX sources have all
   come up empty: search CoinGecko's own listing (thousands of real, ranked
   coins, not a hand-maintained allowlist) for an exact symbol match, and
   trust only the one CoinGecko itself ranks highest by market cap among
   exact matches. A coin with no market cap rank at all is refused rather
   than guessed at, the same anti-impostor floor liquidity plays everywhere
   else in this file: a brand new, unranked listing is exactly what a
   same-symbol scam token looks like, and a real, established asset always
   has a rank. */
async function lookupCoinGeckoBroad(symbol: string): Promise<TokenCard | null> {
  try {
    const headers = cgHeaders();
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { headers, next: { revalidate: 300 } }
    );
    if (!searchRes.ok) return null;
    const searchBody = (await searchRes.json()) as {
      coins?: CoinGeckoSearchCoin[];
    };
    const exact = (searchBody.coins ?? [])
      .filter((c) => c.id && c.symbol?.toLowerCase() === symbol)
      .sort(
        (a, b) =>
          (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity)
      );
    const best = exact[0];
    if (!best?.id || best.market_cap_rank == null) return null;

    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${best.id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { headers, next: { revalidate: 60 } }
    );
    if (!priceRes.ok) return null;
    const priceBody = (await priceRes.json()) as Record<string, CoinGeckoPrice>;
    const d = priceBody[best.id];
    if (!d || typeof d.usd !== "number") return null;

    return {
      symbol: (best.symbol ?? symbol).toUpperCase(),
      name: best.name ?? best.symbol ?? symbol,
      priceUsd: d.usd,
      change24h: typeof d.usd_24h_change === "number" ? d.usd_24h_change : null,
      volume24h: typeof d.usd_24h_vol === "number" ? d.usd_24h_vol : null,
      marketCap: typeof d.usd_market_cap === "number" ? d.usd_market_cap : null,
      marketCapIsFdv: false,
      liquidityUsd: null,
      chain: null,
      address: null,
      coingeckoId: best.id,
      url: `https://www.coingecko.com/en/coins/${best.id}`,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function lookupToken(query: string): Promise<TokenCard | null> {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  if (!q) return null;
  if (BLOCKED_SYMBOLS.has(q)) return null;

  const cached = cacheGet(q);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.card;

  const isAddress = /^0x[a-f0-9]{40}$/.test(q);

  // Majors and blue chips: canonical price from CoinGecko, never an impostor.
  if (!isAddress && COINGECKO_IDS[q]) {
    const major = await lookupMajor(q);
    if (major) {
      cacheSet(q, major);
      return major;
    }
    // fall through to the rest of the chain only if CoinGecko was unreachable
  }

  /* GeckoTerminal before DexScreener for on-chain tokens.
   *
   * Both index DEX pools, and DexScreener stays as the fallback because it
   * has the broader long tail. GeckoTerminal goes first because it is the
   * CoinGecko network's own on-chain index: the same house that provides our
   * canonical major-coin prices above, so a token that appears in both reads
   * consistently rather than showing one price as a major and a different one
   * as a pool. It also returns market cap and FDV as separate fields, which
   * is what lets the card state honestly which of the two it is showing.
   *
   * The same guards apply as everywhere else in this file: exact symbol or
   * address match only, EVM chains only, and the liquidity floor. A second
   * source is a second way to be confidently wrong if it is trusted more
   * loosely than the first. */
  const gecko = await lookupGeckoTerminal(q, isAddress);
  if (gecko) {
    cacheSet(q, gecko);
    return gecko;
  }

  const dex = await lookupDexScreenerEvm(q, isAddress);
  if (dex) {
    cacheSet(q, dex);
    return dex;
  }

  /* Nothing tradeable in-app has this symbol. An address query stops here: a
     raw contract address with no EVM DEX match has no broader identity to
     search CoinGecko by. A symbol query gets one more real, ranked source
     before the realm gives up on it (see lookupCoinGeckoBroad). */
  if (!isAddress) {
    const broad = await lookupCoinGeckoBroad(q);
    if (broad) {
      cacheSet(q, broad);
      return broad;
    }
  }

  cacheSet(q, null);
  return null;
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
