import "server-only";
import { tradeChainById } from "@/lib/trade/config";

/* Real, current USD prices for (chainId, address) pairs, read straight off
   DexScreener's batched token endpoint, the same one /api/scrying's own
   enrichment pass uses (see app/api/scrying/route.ts's enrichFor). Built for
   the watchlist alert surface: arming an alert needs one real price, checking
   armed alerts needs many, and both must be the same number so a member's
   armed threshold means what it said when they set it.

   DexScreener's /tokens/{addresses} endpoint takes addresses only, not a
   chain, and can answer with pairs for that address across every chain it
   indexes. A watchlist row already knows which chain it means, so every
   lookup here is filtered to that chain's own DexScreener slug before a price
   is trusted, exactly the same guard lookupToken and the scrying enrichment
   both apply for the same reason: an address can exist as a different, real
   token on a different chain, and a price from the wrong one is not this
   coin's price. Where more than one pair matches (chain, address), the
   deepest-liquidity pair wins, same as scrying. */

interface DexPricePair {
  baseToken?: { address?: string; symbol?: string };
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
}

/* A real price plus the real symbol it came from, for callers (the alert
   check route) that need to name the coin in a human message rather than
   just compare a number. */
export interface DexPriceInfo {
  price: number;
  symbol: string | null;
}

const ADDRESSES_PER_REQUEST = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* address (lowercased) -> every real pair DexScreener returned for it, across
   whatever chains it indexes. Chain filtering happens in the callers below,
   once per (chainId, address) they actually asked about. */
async function fetchPairsByAddress(
  addresses: string[]
): Promise<Map<string, DexPricePair[]>> {
  const byAddress = new Map<string, DexPricePair[]>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!unique.length) return byAddress;

  await Promise.all(
    chunk(unique, ADDRESSES_PER_REQUEST).map(async (group) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${group.join(",")}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const body = (await res.json()) as { pairs?: DexPricePair[] | null };
        for (const p of body.pairs ?? []) {
          const addr = p.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          const list = byAddress.get(addr);
          if (list) list.push(p);
          else byAddress.set(addr, [p]);
        }
      } catch {
        /* a miss here just means this batch's prices stay unknown, never
           fabricated */
      }
    })
  );
  return byAddress;
}

/* Pick the real price (and its real symbol) for one (chainId, address): the
   deepest-liquidity pair DexScreener returned that actually trades on that
   chain. Null when nothing real matched, never a guess. */
function bestInfo(
  pairs: DexPricePair[] | undefined,
  dexChain: string
): DexPriceInfo | null {
  if (!pairs?.length) return null;
  let best: DexPricePair | null = null;
  for (const p of pairs) {
    if (p.chainId !== dexChain) continue;
    if (!best || (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0)) best = p;
  }
  const price = best?.priceUsd ? Number(best.priceUsd) : null;
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  return { price, symbol: best?.baseToken?.symbol ?? null };
}

/* One real current price for a single (chainId, address). Used when arming or
   re-arming an alert. */
export async function fetchDexPrice(
  chainId: number,
  address: string
): Promise<number | null> {
  const chain = tradeChainById(chainId);
  if (!chain) return null;
  const byAddress = await fetchPairsByAddress([address]);
  return bestInfo(byAddress.get(address.toLowerCase()), chain.dex)?.price ?? null;
}

/* Real current prices (and symbols) for many (chainId, address) pairs at
   once, batched into as few DexScreener requests as the endpoint allows
   rather than one request per coin. Used by GET /api/watchlist/alerts/check,
   where a member can have several alerts armed across several chains. Keyed
   by "chainId:address" (lowercased) so the same address on two different
   chains never collides, the same identity rule the watchlist itself uses.
   Pairs with no real match are simply absent from the result, never
   zero-filled. */
export async function fetchDexPricesBatch(
  pairs: { chainId: number; address: string }[]
): Promise<Map<string, DexPriceInfo>> {
  const out = new Map<string, DexPriceInfo>();
  const byAddress = await fetchPairsByAddress(pairs.map((p) => p.address));
  for (const { chainId, address } of pairs) {
    const chain = tradeChainById(chainId);
    if (!chain) continue;
    const info = bestInfo(byAddress.get(address.toLowerCase()), chain.dex);
    if (info) out.set(`${chainId}:${address.toLowerCase()}`, info);
  }
  return out;
}
