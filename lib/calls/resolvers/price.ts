import "server-only";
import { COINGECKO_IDS, lookupToken, type TokenCard } from "@/lib/data/tokens";
import { EVM_DEX_CHAINS, MIN_LIQUIDITY_USD } from "@/lib/trade/config";
import type { CallData, PriceSubject, CallVerdict } from "@/lib/calls/types";
import { priceSubjectFor } from "@/lib/calls/types";

/* The price resolver: the realm's original Call behaviour, corrected.

   V2 finding P3. Settlement used to call lookupToken(call.token), which
   re-resolves the ticker against DexScreener's search at settlement time. A
   ticker is not an identity. Anyone can deploy a token called NAKA tomorrow
   with deeper liquidity than the one a member Called, and the old path would
   settle the member's Call against the impostor's price, because the stored
   address was written to the row and then never read again.

   Identity is now the contract address and chain, or for a major the canonical
   CoinGecko id, pinned at creation and read back at settlement. */

/* Pin the identity of a token card at Call creation. */
export function pinSubject(card: TokenCard): PriceSubject | null {
  if (card.address && card.chain && EVM_DEX_CHAINS.has(card.chain)) {
    return { kind: "dex", address: card.address, chain: card.chain };
  }
  const id = COINGECKO_IDS[card.symbol.toLowerCase()];
  if (id) return { kind: "coingecko", id };
  return null;
}

interface DexPair {
  chainId?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
}

/* The realm's shared liquidity floor from lib/trade/config.ts. Below it a print
   is too easily manipulated to settle a Call against, so settlement refuses and
   the next sweep tries again. */

async function dexPrice(address: string, chain: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { pairs?: DexPair[] };
    /* Exact address on the exact chain. No symbol matching anywhere in this
       path, which is the entire point of the fix. */
    const pairs = (body.pairs ?? [])
      .filter(
        (p) =>
          p.chainId === chain &&
          p.baseToken?.address?.toLowerCase() === address.toLowerCase() &&
          (p.liquidity?.usd ?? 0) >= MIN_LIQUIDITY_USD
      )
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const price = pairs[0]?.priceUsd ? Number(pairs[0].priceUsd) : null;
    return price !== null && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function coingeckoPrice(id: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { usd?: number }>;
    const price = body[id]?.usd;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/* The settlement price for a pinned subject, or null when there is no
   trustworthy print. No data, no verdict: the Call stays open and the next
   sweep tries again, which is strictly better than settling on a guess. */
export async function settlementPrice(
  subject: PriceSubject
): Promise<number | null> {
  if (subject.kind === "dex") return dexPrice(subject.address, subject.chain);
  if (subject.kind === "coingecko") return coingeckoPrice(subject.id);

  /* Legacy rows only, sealed before identity was pinned. This is the old,
     wrong behaviour, kept solely so pre-V2 rows can still be settled at all,
     and reachable by nothing a member can create today. */
  const card = await lookupToken(subject.token);
  return card?.priceUsd ?? null;
}

export interface PriceResolution {
  verdict: Extract<CallVerdict, "hit" | "miss">;
  settledPrice: number;
}

/* Did the Call land.

   A threshold of zero is the V1 behaviour, any move in the stated direction,
   which is what every existing row asked for. A threshold above zero requires
   the move to actually clear the bar, which is the surface fix for the
   "+0.01% counts as a hit" complaint; the root fix is that pi_0 prices the bar
   into the score in the first place. */
export async function resolvePriceCall(
  call: CallData
): Promise<PriceResolution | null> {
  const subject = priceSubjectFor(call);
  if (!subject) return null;
  const entry = call.entry_price;
  if (typeof entry !== "number" || !(entry > 0)) return null;

  const price = await settlementPrice(subject);
  if (price === null) return null;

  const threshold = typeof call.threshold === "number" ? call.threshold : 0;
  const target =
    call.stance === "down" ? entry * (1 - threshold) : entry * (1 + threshold);
  const hit = call.stance === "down" ? price < target : price > target;

  return { verdict: hit ? "hit" : "miss", settledPrice: price };
}
