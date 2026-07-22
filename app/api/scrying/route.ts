import { json } from "@/lib/auth/server";
import {
  MIN_LIQUIDITY_USD,
  MIN_MARKET_CAP_USD,
  TRADE_CHAINS,
  tradeChainByGecko,
} from "@/lib/trade/config";

/* Organic market intelligence for The Scrying Glass: hundreds of live EVM coins
   aggregated from GeckoTerminal's top and trending pools across every chain we
   trade, ranked by real 24h volume. Keyless, cached server-side so the glass
   stays fresh without hammering the source.

   EVM ONLY. The quality floors live in lib/trade/config.ts. Deduped to one
   entry per token (its deepest pool). */

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
  relationships?: {
    base_token?: { data?: { id?: string } };
  };
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

/* GeckoTerminal serves a placeholder "missing.png" for tokens without art;
   treat that (and blanks) as no logo so the UI draws its own glyph instead. */
function cleanLogo(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.toLowerCase().includes("missing")) return null;
  return src;
}

interface Coin {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number;
  marketCap: number | null;
  fdv: number | null;
  chain: string;
  watchChain: string | null;
  network: string;
  logo: string | null;
  address: string;
  url: string;
}

/* Map one GeckoTerminal pools response into coins on a given network. */
function mapPools(networkId: string, body: {
  data?: GeckoPool[];
  included?: GeckoIncluded[];
}): Coin[] {
  const tokens = new Map<string, GeckoIncluded>();
  for (const inc of body.included ?? []) {
    if (inc.type === "token" && inc.id) tokens.set(inc.id, inc);
  }
  const chain = tradeChainByGecko(networkId);
  const out: Coin[] = [];
  for (const pool of body.data ?? []) {
    const a = pool.attributes ?? {};
    const baseId = pool.relationships?.base_token?.data?.id ?? "";
    const base = tokens.get(baseId);
    const address = base?.attributes?.address ?? "";
    if (!address) continue;
    const liquidity = Number(a.reserve_in_usd ?? 0);
    const marketCap = a.market_cap_usd ? Number(a.market_cap_usd) : null;
    const fdv = a.fdv_usd ? Number(a.fdv_usd) : null;
    const capForFloor = marketCap ?? fdv ?? 0;
    // Quality floors: thin liquidity and micro-cap launches skew to scams.
    if (liquidity < MIN_LIQUIDITY_USD || capForFloor < MIN_MARKET_CAP_USD)
      continue;
    out.push({
      symbol: base?.attributes?.symbol?.toUpperCase() ?? "?",
      name: a.name ?? base?.attributes?.name ?? "Unknown",
      priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : null,
      change24h: a.price_change_percentage?.h24
        ? Number(a.price_change_percentage.h24)
        : null,
      volume24h: a.volume_usd?.h24 ? Number(a.volume_usd.h24) : null,
      liquidityUsd: liquidity,
      marketCap,
      fdv,
      chain: chain?.name ?? networkId,
      watchChain: chain ? String(chain.id) : null,
      network: networkId,
      logo: cleanLogo(base?.attributes?.image_url),
      address,
      url: address
        ? `https://www.geckoterminal.com/${networkId}/pools/${pool.id?.split("_").slice(1).join("_") ?? ""}`
        : "",
    });
  }
  return out;
}

async function fetchPools(networkId: string, page: number): Promise<Coin[]> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${networkId}/pools?include=base_token&page=${page}`,
      { headers: { accept: "application/json" }, next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    return mapPools(networkId, await res.json());
  } catch {
    return [];
  }
}

async function readTrending() {
  // Aggregate the top two pages of top pools for every EVM chain we trade, so
  // the glass carries hundreds of live coins rather than a handful.
  const nets = TRADE_CHAINS.map((c) => c.gecko);
  const jobs: Promise<Coin[]>[] = [];
  for (const net of nets) {
    jobs.push(fetchPools(net, 1));
    jobs.push(fetchPools(net, 2));
  }
  const batches = await Promise.all(jobs);
  const all = batches.flat();
  if (all.length === 0) return { trending: [], error: "unreachable" as const };

  // Dedupe to one entry per token (its deepest pool), then rank by 24h volume.
  const best = new Map<string, Coin>();
  for (const c of all) {
    const key = `${c.network}:${c.address.toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || c.liquidityUsd > prev.liquidityUsd) best.set(key, c);
  }
  const trending = [...best.values()]
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, 200);

  return { trending };
}

export async function GET() {
  return json(await readTrending());
}
