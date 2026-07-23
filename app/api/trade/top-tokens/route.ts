import { requireProfile, json } from "@/lib/auth/server";
import { tradeChainById } from "@/lib/trade/config";
import { chainLogo } from "@/lib/trade/token-list";

/* The active-coin roll for The Swap's picker: the deepest, most-traded coins on
   a chain right now, so the sheet opens like a real DEX token list (scroll
   through 100+ live coins with logos, chains and prices) instead of a handful
   of hardcoded majors. Pulled from GeckoTerminal top pools for the chain,
   deduped to one row per token (its deepest pool) and ranked by 24h volume.
   Keyless, cached server-side. Members only. Real data only. */

const MIN_LIQUIDITY_USD = 8_000;
const PAGES = 4;

interface GeckoPool {
  id?: string;
  attributes?: {
    name?: string;
    base_token_price_usd?: string | null;
    reserve_in_usd?: string | null;
    volume_usd?: { h24?: string | null };
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

export interface TopToken {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  chainLabel: string;
  chainLogo: string | null;
  logo: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
}

function cleanLogo(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.toLowerCase().includes("missing")) return null;
  return src;
}

async function fetchPage(
  gecko: string,
  page: number
): Promise<{ data?: GeckoPool[]; included?: GeckoIncluded[] } | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${gecko}/pools?include=base_token&page=${page}`,
      { headers: { accept: "application/json" }, next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      data?: GeckoPool[];
      included?: GeckoIncluded[];
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const chainId = Number(new URL(req.url).searchParams.get("chain") ?? "");
  const chain = tradeChainById(chainId);
  if (!chain) return json({ results: [] });

  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) => fetchPage(chain.gecko, i + 1))
  );

  const best = new Map<string, TopToken>();
  for (const body of pages) {
    if (!body) continue;
    const tokens = new Map<string, GeckoIncluded>();
    for (const inc of body.included ?? [])
      if (inc.type === "token" && inc.id) tokens.set(inc.id, inc);

    for (const pool of body.data ?? []) {
      const a = pool.attributes ?? {};
      const base = tokens.get(pool.relationships?.base_token?.data?.id ?? "");
      const address = base?.attributes?.address ?? "";
      if (!address) continue;
      const liquidity = Number(a.reserve_in_usd ?? 0);
      if (liquidity < MIN_LIQUIDITY_USD) continue;

      const key = address.toLowerCase();
      const prev = best.get(key);
      if (prev && (prev.liquidityUsd ?? 0) >= liquidity) continue;
      best.set(key, {
        address,
        symbol: (base?.attributes?.symbol ?? "?").toUpperCase(),
        name: base?.attributes?.name ?? a.name ?? "Unknown",
        chainId: chain.id,
        chainLabel: chain.name,
        chainLogo: chainLogo(chain.id),
        logo: cleanLogo(base?.attributes?.image_url),
        priceUsd: a.base_token_price_usd ? Number(a.base_token_price_usd) : null,
        liquidityUsd: liquidity,
        volume24h: a.volume_usd?.h24 ? Number(a.volume_usd.h24) : 0,
      });
    }
  }

  const results = [...best.values()]
    .sort((x, y) => (y.volume24h ?? 0) - (x.volume24h ?? 0))
    .slice(0, 120);

  return json({ results });
}
