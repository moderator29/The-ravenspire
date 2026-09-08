import { getProfile, json } from "@/lib/auth/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { lookupToken } from "@/lib/data/tokens";
import { tradeChainByDex } from "@/lib/trade/config";
import { chainLogo } from "@/lib/trade/token-list";

/*
  In-app coin data for The Scrying Glass. Real market data only, keyless:
  DexScreener supplies the logo, price, change, liquidity, volume and market
  cap for a token address; GeckoTerminal supplies real recent price history
  (OHLCV) for the deepest pool when it can be resolved. When the history well
  is dry we return no series and the page draws an honest 24h-implied line and
  says so. Nothing here is fabricated; when a match is not trustworthy we
  answer with an error and the page tells the member the glass is clouded.
*/

/* Below this DEX liquidity a price is too easily manipulated to present as
   authoritative, mirroring the floor used across the market plumbing. */
const MIN_LIQUIDITY_USD = 10_000;

/* DexScreener chainId -> human label. */
const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  polygon: "Polygon",
  avalanche: "Avalanche",
  solana: "Solana",
  fantom: "Fantom",
  pulsechain: "PulseChain",
};

/* DexScreener chainId -> GeckoTerminal network id (for OHLCV history). */
const GECKO_NETWORK: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon_pos",
  avalanche: "avax",
  solana: "solana",
  fantom: "ftm",
};

/* GeckoTerminal network id (as passed from the Scrying Glass) -> DexScreener
   chainId, so we can prefer the pair on the chain the member tapped. */
const DEX_CHAIN_FROM_GECKO: Record<string, string> = {
  eth: "ethereum",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon_pos: "polygon",
  avax: "avalanche",
  solana: "solana",
  ftm: "fantom",
};

/* DexScreener chainId -> block explorer token page. */
const EXPLORER_TOKEN: Record<string, string> = {
  ethereum: "https://etherscan.io/token/",
  base: "https://basescan.org/token/",
  bsc: "https://bscscan.com/token/",
  arbitrum: "https://arbiscan.io/token/",
  optimism: "https://optimistic.etherscan.io/token/",
  polygon: "https://polygonscan.com/token/",
  avalanche: "https://snowtrace.io/token/",
  solana: "https://solscan.io/token/",
  fantom: "https://ftmscan.com/token/",
};

interface DexPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  baseToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
}

export interface CoinChartPoint {
  t: number;
  c: number;
  /* Open / high / low for candlestick mode; present when the source gives full
     OHLCV (GeckoTerminal does), absent for close-only fallbacks. */
  o?: number;
  h?: number;
  l?: number;
}

export interface CoinData {
  address: string;
  symbol: string;
  name: string;
  chainId: string | null;
  chainLabel: string | null;
  /* The chain's own mark (Trust Wallet asset CDN), same source the Scrying
     Glass board's CoinMark corner badge uses, so a coin page and a board row
     agree on what "this coin lives on BNB Chain" looks like: a logo, not a
     text pill. Null off the trade chain allowlist. */
  chainLogo: string | null;
  logo: string | null;
  priceUsd: number | null;
  change24h: number | null;
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume24h: number | null;
  txns24h: { buys: number; sells: number } | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  marketCapIsFdv: boolean;
  fdv: number | null;
  dexId: string | null;
  dexUrl: string | null;
  explorerUrl: string | null;
  chart: { source: "geckoterminal"; points: CoinChartPoint[] } | null;
  /* Trading support: the EIP-155 chain id when this token lives on a tradable
     EVM chain (null for non-EVM, which is never tradable in-app), the token
     decimals for base-unit conversion, and the pool's age for the rug-risk
     read. */
  evmChainId: number | null;
  decimals: number | null;
  pairCreatedAt: number | null;
  fetchedAt: number;
}

function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

/* Solana mints and other non-EVM ids are long base58 strings; a short token
   like "RSP" is a symbol to resolve, not an address to look up directly. */
function looksLikeAddress(s: string): boolean {
  return isEvmAddress(s) || (s.length >= 30 && /^[a-zA-Z0-9]+$/.test(s));
}

async function fetchPairs(address: string): Promise<DexPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { pairs?: DexPair[] | null };
    return body.pairs ?? [];
  } catch {
    return [];
  }
}

function pickPair(
  pairs: DexPair[],
  address: string,
  preferChain: string | null
): DexPair | null {
  const addr = address.toLowerCase();
  const forThisToken = pairs.filter(
    (p) => p.baseToken?.address?.toLowerCase() === addr
  );
  const pool = forThisToken.length > 0 ? forThisToken : pairs;
  const sorted = [...pool].sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
  );
  if (preferChain) {
    const onChain = sorted.find((p) => p.chainId === preferChain);
    if (onChain) return onChain;
  }
  return sorted[0] ?? null;
}

interface GeckoPoolAttrs {
  address?: string;
  base_token_price_usd?: string | null;
  reserve_in_usd?: string | null;
  market_cap_usd?: string | null;
  fdv_usd?: string | null;
  volume_usd?: { h24?: string | null };
  price_change_percentage?: {
    m5?: string | null;
    h1?: string | null;
    h6?: string | null;
    h24?: string | null;
  };
  transactions?: { h24?: { buys?: number; sells?: number } };
  pool_created_at?: string | null;
}

interface GeckoTokenPool {
  id?: string;
  attributes?: GeckoPoolAttrs;
  relationships?: {
    base_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
}

interface GeckoIncludedToken {
  id?: string;
  type?: string;
  attributes?: {
    symbol?: string;
    name?: string;
    address?: string;
    image_url?: string | null;
  };
}

/* A fallback identity + market read straight from GeckoTerminal, keyed by
   network and address, used only when DexScreener has no pair for a token
   the Scrying Glass itself already proved real. The board's own list is
   sourced from GeckoTerminal (app/api/scrying/route.ts), and the two
   providers do not index the same pools: a pool real and liquid enough to
   sit on the board with a real market cap could still be one DexScreener's
   own search has not picked up yet, and a coin a member can see and tap on
   the board must never dead-end on its own detail page for a reason that has
   nothing to do with whether it is real. Same honesty rule as the primary
   path: a coin GeckoTerminal also cannot find still answers "not found"
   rather than inventing one, and the liquidity floor below is checked
   identically either way. */
async function fetchFromGecko(
  network: string,
  address: string
): Promise<DexPair | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}/pools?page=1`,
      { headers: { accept: "application/json" }, next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: GeckoTokenPool[];
      included?: GeckoIncludedToken[];
    };
    const pools = body.data ?? [];
    if (pools.length === 0) return null;

    const tokens = new Map<string, GeckoIncludedToken["attributes"]>();
    for (const inc of body.included ?? []) {
      if (inc.type === "token" && inc.id) tokens.set(inc.id, inc.attributes);
    }

    // The deepest pool by real liquidity, the same rule the rest of this
    // route uses to pick among several pairs for one token.
    const best = [...pools].sort(
      (a, b) =>
        Number(b.attributes?.reserve_in_usd ?? 0) -
        Number(a.attributes?.reserve_in_usd ?? 0)
    )[0];
    const a = best?.attributes;
    if (!a?.address) return null;

    const baseId = best?.relationships?.base_token?.data?.id ?? "";
    const base = tokens.get(baseId);
    const dexChain = DEX_CHAIN_FROM_GECKO[network] ?? null;
    const toNum = (v: string | null | undefined): number | undefined =>
      v != null && v !== "" ? Number(v) : undefined;

    return {
      chainId: dexChain ?? undefined,
      dexId: best?.relationships?.dex?.data?.id,
      url: best?.id
        ? `https://www.geckoterminal.com/${network}/pools/${
            best.id.split("_").slice(1).join("_")
          }`
        : undefined,
      pairAddress: a.address,
      pairCreatedAt: a.pool_created_at
        ? Date.parse(a.pool_created_at)
        : undefined,
      baseToken: {
        symbol: base?.symbol,
        name: base?.name,
        address: base?.address ?? address,
      },
      priceUsd: a.base_token_price_usd ?? undefined,
      priceChange: {
        m5: toNum(a.price_change_percentage?.m5),
        h1: toNum(a.price_change_percentage?.h1),
        h6: toNum(a.price_change_percentage?.h6),
        h24: toNum(a.price_change_percentage?.h24),
      },
      volume: { h24: toNum(a.volume_usd?.h24) },
      txns: a.transactions?.h24 ? { h24: a.transactions.h24 } : undefined,
      liquidity: { usd: toNum(a.reserve_in_usd) },
      marketCap: toNum(a.market_cap_usd),
      fdv: toNum(a.fdv_usd),
      info: base?.image_url ? { imageUrl: base.image_url } : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchChart(
  chainId: string | null,
  pairAddress: string | null
): Promise<CoinChartPoint[] | null> {
  if (!chainId || !pairAddress) return null;
  const network = GECKO_NETWORK[chainId];
  if (!network) return null;
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}/ohlcv/hour?aggregate=1&limit=48&currency=usd`,
      { headers: { accept: "application/json" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { attributes?: { ohlcv_list?: number[][] } };
    };
    const list = body.data?.attributes?.ohlcv_list ?? [];
    // GeckoTerminal ohlcv_list rows are [ts, open, high, low, close, volume].
    const points = list
      .map((row) => ({
        t: (row[0] ?? 0) * 1000,
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4]),
      }))
      .filter((p) => p.t > 0 && Number.isFinite(p.c) && p.c > 0)
      .sort((a, b) => a.t - b.t);
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

/* Token decimals via GeckoTerminal token info (keyless). Needed to convert 0x
   base-unit amounts to human figures on the trading panel. Null when it cannot
   be read; the panel then declines to guess a "you receive" figure. */
async function fetchDecimals(
  chainId: string | null,
  address: string
): Promise<number | null> {
  if (!chainId) return null;
  const network = GECKO_NETWORK[chainId];
  if (!network) return null;
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}`,
      { headers: { accept: "application/json" }, next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { attributes?: { decimals?: number | null } };
    };
    const dec = body.data?.attributes?.decimals;
    return typeof dec === "number" && dec >= 0 && dec <= 36 ? dec : null;
  } catch {
    return null;
  }
}

/* C4: one coin read is a DexScreener search, a GeckoTerminal OHLCV page and an
   RPC decimals call. The route stays open to visitors, because a coin page is
   the thing a member shares outward and it must open for whoever taps it, so
   it is metered the way the glass is: on the account when we know it, on the
   (spoofable) address only when we do not. */
export async function GET(req: Request) {
  const profile = await getProfile(req);
  const rl = await rateLimit(
    callerKey("coin", req, profile?.id),
    profile ? 300 : 120,
    3600
  );
  if (!rl.ok)
    return json(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      429
    );

  const url = new URL(req.url);
  const rawId = (url.searchParams.get("address") ?? "").trim();
  const net = url.searchParams.get("net"); // GeckoTerminal network id, optional
  const symbolHint = url.searchParams.get("symbol");

  if (!rawId && !symbolHint) return json({ error: "missing address" }, 400);

  let address = rawId;
  let preferChain = net ? (DEX_CHAIN_FROM_GECKO[net] ?? null) : null;

  // Resolve a bare symbol (or a segment that is clearly not an address) to a
  // real address through the shared, trust-checked lookup.
  if ((!address || !looksLikeAddress(address)) && (symbolHint || address)) {
    const card = await lookupToken(symbolHint ?? address);
    if (!card?.address) return json({ error: "not found" }, 404);
    address = card.address;
    if (!preferChain && card.chain) preferChain = card.chain;
  }

  if (!address) return json({ error: "not found" }, 404);

  const pairs = await fetchPairs(address);
  let pair = pickPair(pairs, address, preferChain);
  const dexScreenerHasIt =
    pair && pair.baseToken?.symbol && (pair.liquidity?.usd ?? 0) >= MIN_LIQUIDITY_USD;

  // DexScreener came up empty or too thin; try the same token straight
  // through GeckoTerminal before giving up. Needs a network id: the one the
  // Scrying Glass passed, or the one implied by a chain a symbol lookup
  // already resolved.
  if (!dexScreenerHasIt) {
    const geckoNetwork = net ?? (preferChain ? GECKO_NETWORK[preferChain] : null);
    if (geckoNetwork) {
      const fallback = await fetchFromGecko(geckoNetwork, address);
      if (fallback && (fallback.liquidity?.usd ?? 0) >= MIN_LIQUIDITY_USD) {
        pair = fallback;
      }
    }
  }

  if (
    !pair ||
    !pair.baseToken?.symbol ||
    (pair.liquidity?.usd ?? 0) < MIN_LIQUIDITY_USD
  ) {
    return json({ error: "not found" }, 404);
  }

  const chainId = pair.chainId ?? null;
  const hasRealMcap = typeof pair.marketCap === "number" && pair.marketCap > 0;
  const tokenAddress = pair.baseToken.address ?? address;
  const evmChain = chainId ? tradeChainByDex(chainId) : undefined;
  // Only spend the extra decimals lookup on tokens we can actually trade.
  const [points, decimals] = await Promise.all([
    fetchChart(chainId, pair.pairAddress ?? null),
    evmChain ? fetchDecimals(chainId, tokenAddress) : Promise.resolve(null),
  ]);

  const data: CoinData = {
    address: tokenAddress,
    symbol: pair.baseToken.symbol.toUpperCase(),
    name: pair.baseToken.name ?? pair.baseToken.symbol,
    chainId,
    chainLabel: chainId ? (CHAIN_LABELS[chainId] ?? chainId) : null,
    chainLogo: evmChain ? chainLogo(evmChain.id) : null,
    logo: pair.info?.imageUrl ?? null,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    change24h: pair.priceChange?.h24 ?? null,
    change: {
      m5: pair.priceChange?.m5 ?? null,
      h1: pair.priceChange?.h1 ?? null,
      h6: pair.priceChange?.h6 ?? null,
      h24: pair.priceChange?.h24 ?? null,
    },
    volume24h: pair.volume?.h24 ?? null,
    txns24h:
      typeof pair.txns?.h24?.buys === "number" ||
      typeof pair.txns?.h24?.sells === "number"
        ? {
            buys: pair.txns?.h24?.buys ?? 0,
            sells: pair.txns?.h24?.sells ?? 0,
          }
        : null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    marketCap: hasRealMcap ? (pair.marketCap as number) : (pair.fdv ?? null),
    marketCapIsFdv: !hasRealMcap && typeof pair.fdv === "number",
    fdv: typeof pair.fdv === "number" ? pair.fdv : null,
    dexId: pair.dexId ?? null,
    dexUrl: pair.url ?? null,
    explorerUrl:
      chainId && EXPLORER_TOKEN[chainId]
        ? `${EXPLORER_TOKEN[chainId]}${tokenAddress}`
        : null,
    chart: points ? { source: "geckoterminal", points } : null,
    evmChainId: evmChain?.id ?? null,
    decimals,
    pairCreatedAt:
      typeof pair.pairCreatedAt === "number" ? pair.pairCreatedAt : null,
    fetchedAt: Date.now(),
  };

  return json({ coin: data });
}
