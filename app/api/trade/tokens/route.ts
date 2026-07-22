import { requireProfile, json } from "@/lib/auth/server";
import { isEvmDexChain, tradeChainByDex } from "@/lib/trade/config";

/* Search casts a wider net than the discovery glass: a member who types an
   exact ticker or address wants to find the coin even if it is thinly traded,
   so the floor here is low (real liquidity, just not dust). */
const SEARCH_MIN_LIQUIDITY_USD = 1_000;

/* Token search for The Swap. Searches any EVM coin by name, symbol or address
   through DexScreener (keyless), EVM chains only. Solana and every non-EVM
   result is dropped. Deduped per chain+address, ranked by real liquidity so
   the deepest, most tradable market for a symbol leads. Members only, so the
   search cannot be scraped anonymously. Real data only. */

interface DexPair {
  chainId?: string;
  baseToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  info?: { imageUrl?: string };
}

export interface SwapTokenResult {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  chainLabel: string;
  logo: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  // Strip a leading cashtag $ so "$NAKA" searches "NAKA".
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().replace(/^\$/, "");
  if (q.length < 2) return json({ results: [] });

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return json({ results: [] });
    const body = (await res.json()) as { pairs?: DexPair[] | null };
    const pairs = body.pairs ?? [];

    // One best (deepest) market per chain+token, EVM only, above the floor.
    const best = new Map<string, SwapTokenResult & { _liq: number }>();
    for (const p of pairs) {
      const dexChain = p.chainId;
      if (!isEvmDexChain(dexChain)) continue;
      const chain = tradeChainByDex(dexChain!);
      const address = p.baseToken?.address;
      const symbol = p.baseToken?.symbol;
      if (!chain || !address || !symbol) continue;
      const liq = p.liquidity?.usd ?? 0;
      if (liq < SEARCH_MIN_LIQUIDITY_USD) continue;

      const key = `${chain.id}:${address.toLowerCase()}`;
      const existing = best.get(key);
      if (existing && existing._liq >= liq) continue;
      best.set(key, {
        address,
        symbol: symbol.toUpperCase(),
        name: p.baseToken?.name ?? symbol,
        chainId: chain.id,
        chainLabel: chain.name,
        logo: p.info?.imageUrl ?? null,
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        liquidityUsd: liq,
        _liq: liq,
      });
    }

    const results = [...best.values()]
      .sort((a, b) => b._liq - a._liq)
      .slice(0, 20)
      .map(({ _liq, ...rest }) => {
        void _liq;
        return rest;
      });

    return json({ results });
  } catch {
    return json({ results: [] });
  }
}
