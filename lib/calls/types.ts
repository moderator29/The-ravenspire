/* Calls V2 domain types (V2 sections 6.3 and 9).

   A Call used to be {token, stance, timeframe, entry_price, verdict}: a crypto
   price bet and nothing else, which is why the platform reads as SocialFi no
   matter what the copy says. A Call is now a claim with a category and a
   resolver, and the price bet is one resolver among several.

   Backward compatibility is total. Every existing row is read as
   category 'markets' with resolver 'price', the old jsonb shape is exactly the
   price resolver's payload, and no data migration is required. */

import type { CallDirection } from "@/lib/calls/scoring";

export type { CallDirection };

/* What kind of claim this is. Presentational grouping and, for realm, the
   thing that makes the realm itself predictable. */
export const CALL_CATEGORIES = [
  "markets",
  "esports",
  "gaming",
  "culture",
  "sport",
  "realm",
] as const;
export type CallCategory = (typeof CALL_CATEGORIES)[number];

/* Who decides whether the claim came true.
     price      real market data, settled by contract address and chain
     internal   our own tables, zero external cost, cannot be gamed by an oracle
     community  the realm votes on the outcome
     manual     an admin resolves it

   Only price and internal are implemented. community and manual are declared
   so the stored shape does not have to change when they land, and both are
   rejected at Call creation until they exist rather than being accepted and
   silently left open forever. */
export const CALL_RESOLVERS = ["price", "internal", "community", "manual"] as const;
export type CallResolver = (typeof CALL_RESOLVERS)[number];

export const IMPLEMENTED_RESOLVERS: readonly CallResolver[] = ["price", "internal"];

export const CALL_TIMEFRAMES = ["24h", "7d", "30d"] as const;
export type CallTimeframe = (typeof CALL_TIMEFRAMES)[number];

export type CallVerdict = "open" | "hit" | "miss" | "void";

/* The member's stated confidence, in [0.55, 0.99]. */
export type Confidence = number;

/* How the price resolver identifies the subject of the Call.

   This is the fix for finding P3. The old settlement path called
   lookupToken(call.token), re-resolving the ticker at settlement time, so a
   recycled or impersonated ticker settled the Call against a completely
   different token than the one whose price was sealed. Identity is now pinned
   at creation:

     dex        a contract address on a named chain, the only true identity a
                DEX token has
     coingecko  a canonical CoinGecko id, for the majors that have no single
                contract address and resolve through CoinGecko rather than
                DexScreener

   Legacy rows carry neither. They fall back to the ticker, which is what they
   were sealed against, and are flagged as such so the fallback is visible
   rather than silent. */
export type PriceSubject =
  | { kind: "dex"; address: string; chain: string }
  | { kind: "coingecko"; id: string }
  | { kind: "legacy-ticker"; token: string };

/* An internal claim: something about the realm itself, resolvable from our own
   rows. The sleeper feature of section 6.3. It costs nothing, no external
   oracle can move it, and it makes the realm the thing people predict. */
export type InternalClaim =
  | { metric: "house_leads"; house_slug: string }
  | { metric: "house_glory"; house_slug: string; at_least: number }
  | { metric: "member_tier"; profile_id: string; tier: string }
  | { metric: "member_renown"; profile_id: string; at_least: number };

export const INTERNAL_METRICS = [
  "house_leads",
  "house_glory",
  "member_tier",
  "member_renown",
] as const;

/* The `call` jsonb as it is stored on a posts row.

   Everything the old shape carried is still here and still required for the
   price resolver, so a V1 reader keeps working untouched. Everything new is
   optional at the type level and defaulted on read, so a V1 row parses. */
export interface CallData {
  /* V1 fields, unchanged. */
  token?: string;
  address?: string | null;
  chain?: string | null;
  stance?: CallDirection;
  timeframe?: string;
  entry_price?: number;
  verdict?: CallVerdict;
  settled_price?: number;
  settled_at?: string;

  /* V2 fields. Absent on every existing row. */
  category?: CallCategory;
  resolver?: CallResolver;
  /* The member's stated confidence in [0.55, 0.99]. */
  confidence?: Confidence;
  /* Why they think so. Prose, capped, shown on the card. */
  rationale?: string;
  /* Evidence the member cited when they sealed the Call: absolute https links,
     at most three, whitelisted by normalizeSources in lib/calls/analytics.ts.
     Additive and optional like every other V2 field, so a V1 row still parses
     and no reader has to know about it. */
  sources?: string[];
  /* The move the Call requires, as a positive fraction. 0.4 is a 40% move.
     Zero is "any move in the stated direction", which is what every V1 Call
     implicitly asked for and is scored as the coin flip it is. */
  threshold?: number;
  /* pi_0, frozen at creation. See lib/calls/scoring.ts impliedBaseline. */
  pi_0?: number;
  /* The trailing realized volatility pi_0 was computed from, kept so a member
     can be shown why their Call was rated as hard as it was. */
  sigma?: number;
  /* Pinned identity for the price resolver. */
  subject?: PriceSubject;
  /* The claim for the internal resolver. */
  claim?: InternalClaim;
  /* The POINTS the member put behind this Call, frozen at seal time.

     The authoritative escrow record is the call_stakes row, which is what the
     settlement function locks and settles. This copy exists so that every
     surface already reading the `call` jsonb (the feed card, the Call detail,
     the caller profile) can show the stake without a second query, and so a
     Call that was staked still says so if the escrow row is ever pruned. */
  stake?: number;
  /* What settlement did with it: 'returned' when the Call landed or was
     voided, 'burned' when it missed. */
  stake_result?: "returned" | "burned";
  /* POINTS actually paid back, stake plus bonus. Zero on a burn. */
  stake_return?: number;
  /* What the Warden's Pardon put back out of the House treasury, when the
     House had one burning at settlement. */
  stake_pardon?: number;

  /* Settlement output. */
  score?: number;
  /* Which baseline actually produced the score: the volatility model, or the
     crowd once at least three independent members Called the same bucket. */
  score_basis?: "baseline" | "peer" | "legacy";
}

/* Read a stored call with V2 defaults applied. Every existing row reads as a
   markets/price Call with a zero threshold, which is exactly what it was. */
export function normalizeCall(raw: unknown): CallData | null {
  if (!raw || typeof raw !== "object") return null;
  const call = raw as CallData;
  return {
    ...call,
    category: (CALL_CATEGORIES as readonly string[]).includes(call.category ?? "")
      ? (call.category as CallCategory)
      : "markets",
    resolver: (CALL_RESOLVERS as readonly string[]).includes(call.resolver ?? "")
      ? (call.resolver as CallResolver)
      : "price",
    threshold: typeof call.threshold === "number" ? call.threshold : 0,
    verdict: call.verdict ?? "open",
  };
}

/* The identity the price resolver should settle against, derived from the
   stored call. Prefers the pinned subject; falls back to the address and chain
   V1 already stored, which is still an address, not a ticker; falls back to the
   ticker only when the row predates both. */
export function priceSubjectFor(call: CallData): PriceSubject | null {
  if (call.subject) return call.subject;
  if (call.address && call.chain)
    return { kind: "dex", address: call.address, chain: call.chain };
  if (call.token) return { kind: "legacy-ticker", token: call.token };
  return null;
}
