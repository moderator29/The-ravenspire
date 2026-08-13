/* House treasuries and what a House may buy with one (V2 sections 11 and 36.8).

   Houses have Glory, a standing, a roster and six computed titles, and no
   treasury at all. Everything a House "has" is a number derived from what its
   members did, which means a House has never once had to decide anything. A
   treasury is the first thing in the design that a House can be wrong about,
   and that is the whole reason to build it.

   Client safe on purpose, the same way lib/houses/roles.ts is: the hall
   renders the catalogue and the prices, and the price a member is shown has to
   be the price the server charges. The reads and the spend live in
   lib/houses/treasury.ts, which is server only.

   WHERE THE MONEY COMES FROM
   Real sinks and nothing else. Today that is one sink: half of every burned
   Call stake is pooled under the staker's banner (see lib/calls/stake.ts,
   HOUSE_TITHE_BPS) and the other half is destroyed. A House treasury is
   therefore a record of what its members risked and lost, which is a far
   better thing for a House to be made of than a number that only goes up.

   A House that has never had a stake burned under its banner has a treasury of
   zero, and the hall says zero. It is never seeded, never topped up, and never
   estimated. */

/* ------------------------------------------------------------------
   Who may spend
   ------------------------------------------------------------------ */

/* The Lord and the Hand, and nobody else.

   Three ways to get this wrong, and why each is worse:

   Everyone. A treasury any sworn member can spend is a treasury the first
   member to open the hall spends, on whatever they happened to want. There is
   no proposal, no veto and no undo, so "everyone decides" collapses to "the
   fastest member decides" inside a day.

   An admin. The Houses design (section 11.2) is explicitly built to need zero
   admin burden, and handing the one real decision in it back to an operator
   would undo that for no gain.

   One person. A single spender is a single point of failure. A Lord who goes
   quiet for a fortnight freezes their House's treasury for the rest of the
   season, and the members funding it with burned stakes get nothing for it.

   The Lord and the Hand are the top two contributors this season, computed
   from what they actually did and rotated automatically when the season turns
   (lib/houses/scoring.ts, deriveLeadership). So the spenders are already
   chosen by the House's own activity, they are the two members with the most
   invested in the standing the treasury is meant to serve, and there is a real
   fallback when one of them stops showing up.

   Enforced server side against house_members, on an OPEN oath to the House
   being spent from. Never from the client, and never from a role string the
   request carried. */
export const TREASURY_SPENDERS = ["lord", "hand"] as const;

export function maySpendTreasury(role: string | null | undefined): boolean {
  return (TREASURY_SPENDERS as readonly string[]).includes(role ?? "");
}

/* ------------------------------------------------------------------
   Pricing
   ------------------------------------------------------------------ */

/* Every perk is priced per sworn member, and this is the load bearing decision
   in the whole design.

   House scoring is size neutral: a House's score is the sum of its top twenty
   contributors and nothing else (section 11.1b), which is exactly why six
   Houses of wildly unequal membership can compete at all. A flat perk price
   would have quietly undone that. Treasury inflow scales with headcount,
   because a House with sixty members burns roughly three times the stakes a
   House with twenty does, so a flat price means the big House buys every perk
   three times as often. The advantage would be back, wearing a different hat.

   Pricing per member makes the time it takes to afford a perk roughly
   independent of how many members a House has, which is the same neutrality
   the score already has, expressed in the currency.

   The floor exists because a House of one would otherwise buy the whole
   catalogue for pocket change. Five is the smallest number that reads as a
   House rather than a person. */
export const MIN_BILLED_MEMBERS = 5;

export function perkPrice(perk: HousePerkMeta, swornMembers: number): number {
  const billed = Math.max(MIN_BILLED_MEMBERS, Math.trunc(swornMembers) || 0);
  return perk.perMember * billed;
}

/* ------------------------------------------------------------------
   The catalogue
   ------------------------------------------------------------------ */

export const HOUSE_PERKS = ["wardens-pardon", "the-standard", "long-watch"] as const;
export type HousePerkSlug = (typeof HOUSE_PERKS)[number];

export interface HousePerkMeta {
  slug: HousePerkSlug;
  name: string;
  /* One line, in the realm's voice, for the card. */
  blurb: string;
  /* What it actually does, in plain terms, with no romance in it. A member
     spending a House's points is entitled to the mechanism. */
  effect: string;
  /* POINTS per sworn member. See perkPrice. */
  perMember: number;
  /* How long it burns for, in days. */
  durationDays: number;
  /* True when the purchase ring-fences its own cost as a spendable allowance
     rather than simply being switched on. */
  allowance: boolean;
  /* The flat glyph the hall renders beside it. */
  icon: string;
}

export const PERK_META: Record<HousePerkSlug, HousePerkMeta> = {
  /* Perk one: the House as a mutual fund for its own members' losses.

     WHAT IT DOES. While it burns, a sworn member whose staked Call misses gets
     half of the burned stake back in POINTS, paid out of the House treasury,
     capped per Call, until the allowance the purchase ring-fenced runs out.

     WHY IT IS WORTH BUYING. It is the only thing in the realm that makes a
     House materially useful to the member rather than the other way round. It
     also makes members stake harder, and harder stakes burn more, so the perk
     that spends the treasury is the perk that refills it. That loop is
     deliberate and it is why this one is priced first among equals.

     WHY IT IS NOT PAY TO WIN. It pays POINTS. A House's standing is the sum of
     its top twenty members' GLORY, and points have never touched it: see
     house_season_contributions, which sums glory_delta and nothing else. A
     House can pour its entire treasury into pardons and move its rank by
     exactly zero. What it buys is that its members can afford to be bold,
     which shows up as better Calls, which is skill, which is the thing the
     standing is supposed to measure.

     THE ALLOWANCE. The purchase price becomes the pardon pot, and refunds draw
     it down until it is empty or the window closes. Anything left when the
     window closes is not refunded. That is not a rounding decision, it is what
     insurance is: the House bought cover for a week and the cover was there
     whether or not anyone needed it. It also means the perk cannot quietly
     drain a treasury on a bad week, because the exposure is known and bounded
     at the moment of purchase. */
  "wardens-pardon": {
    slug: "wardens-pardon",
    name: "The Warden's Pardon",
    blurb: "The House stands behind a Call that goes wrong.",
    effect:
      "For seven days, a sworn member whose staked Call misses is refunded half the burned stake in POINTS, up to 250 a Call, until the pardon pot is empty.",
    perMember: 120,
    durationDays: 7,
    allowance: true,
    icon: "shield",
  },

  /* Perk two: identity, which is the only thing a House was ever really for.

     WHAT IT DOES. For thirty days, every raven and every Call sealed by a
     sworn member carries the House standard on its card, and the hall's banner
     is gilded.

     WHY IT IS WORTH BUYING. A House is a label on a profile until other people
     can see it happening. The standard puts a House's colour into the Ravenry
     on every raven its members send, which is the cheapest recruitment in the
     realm and the only one that costs the House something to run.

     WHY IT IS NOT PAY TO WIN. It changes nothing that is measured. It is
     ornament, earned rather than ambient (design system section 1), paid for
     out of what the House's own members lost, and it stops burning when the
     thirty days end. */
  "the-standard": {
    slug: "the-standard",
    name: "The Standard",
    blurb: "The House colour flies over every raven its members send.",
    effect:
      "For thirty days, ravens and Calls from sworn members carry the House standard, and the hall's banner is gilded.",
    perMember: 60,
    durationDays: 30,
    allowance: false,
    icon: "banner",
  },

  /* Perk three: capacity, and the one that needs the honest caveat.

     WHAT IT DOES. For seven days, every sworn member may hold six open Calls
     instead of five.

     WHY IT IS WORTH BUYING. The five slot ceiling is the anti-farming rule
     that makes every Call worth a slot (section 9.5, rule 2). Lifting it by
     one for a week is a real, felt change for exactly the members who are
     pressed against it, which is the active ones.

     THE CAVEAT, PLAINLY. This is the only perk in the catalogue that can move
     a House's standing, because a sixth slot is a sixth chance to earn Glory.
     It is in the catalogue anyway, and here is the reasoning. It does not
     break size neutrality: the score counts twenty contributors whether the
     House has twenty members or two hundred, the price scales with membership
     so the time to afford it does not, and every House can buy the same thing.
     What it converts is a House's own burned stakes into a week of extra
     capacity for its members, which is a House spending its losses on its
     members' ambition. A sixth slot is also worth nothing to a member who
     makes bad Calls: it is one more chance to be scored against a difficulty
     baseline, and a wrong Call costs Season Rating and a burned stake. The
     ceiling on the effect is one slot and seven days, which is why it is one
     and seven rather than three and thirty. */
  "long-watch": {
    slug: "long-watch",
    name: "The Long Watch",
    blurb: "A sixth Call may run under the banner.",
    effect:
      "For seven days, every sworn member may hold six open Calls instead of five.",
    perMember: 200,
    durationDays: 7,
    allowance: false,
    icon: "target",
  },
};

export function perkMeta(slug: string): HousePerkMeta | null {
  return PERK_META[slug as HousePerkSlug] ?? null;
}

/* ------------------------------------------------------------------
   What an active perk actually does
   ------------------------------------------------------------------ */

/* The share of a burned stake the Warden's Pardon returns, and the ceiling per
   Call.

   Half, because the House only ever received half (HOUSE_TITHE_BPS): a pardon
   that returned the whole stake would pay out twice what the burn paid in, and
   a treasury would empty in half the Calls that filled it. At half, a House
   running a permanent pardon is exactly break even on its own members' burns,
   which is a real and legible choice: be a mutual fund, or buy something else.

   The per Call ceiling exists so one member staking the maximum cannot consume
   a small House's whole pot in two settlements. 250 is half of a 500 stake, so
   the cover is total up to a stake of 500 and partial above it. */
export const PARDON_SHARE_BPS = 5000;
export const PARDON_CAP_PER_CALL = 250;

export function pardonRefund(burned: number, allowanceLeft: number): number {
  if (burned <= 0 || allowanceLeft <= 0) return 0;
  const half = Math.floor((burned * PARDON_SHARE_BPS) / 10000);
  return Math.max(0, Math.min(half, PARDON_CAP_PER_CALL, allowanceLeft));
}

/* The open-Call ceiling for a member, given the perks burning over their House
   right now. The base is MAX_OPEN_CALLS in lib/calls/create.ts; this returns
   the bonus so the two do not have to import each other. */
export const LONG_WATCH_EXTRA_SLOTS = 1;

/* ------------------------------------------------------------------
   Views
   ------------------------------------------------------------------ */

/* A perk as the hall and the routes pass it around. Mirrors the house_perks
   row, minus the bookkeeping. */
export interface HousePerkView {
  slug: string;
  cost: number;
  starts_at: string;
  expires_at: string;
  allowance_remaining: number | null;
  actor_id: string | null;
}

/* Is this perk burning right now. Reads the timestamps rather than a stored
   flag, so a perk expires on its own and nothing has to sweep it. An allowance
   perk with an empty pot is spent, even inside its window: cover that cannot
   pay is not cover. */
export function perkIsActive(
  perk: Pick<HousePerkView, "slug" | "starts_at" | "expires_at" | "allowance_remaining">,
  now: number = Date.now()
): boolean {
  const starts = Date.parse(perk.starts_at);
  const ends = Date.parse(perk.expires_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
  if (now < starts || now >= ends) return false;
  const meta = perkMeta(perk.slug);
  if (meta?.allowance && (perk.allowance_remaining ?? 0) <= 0) return false;
  return true;
}

export function activePerks(
  perks: HousePerkView[],
  now: number = Date.now()
): HousePerkView[] {
  return perks.filter((p) => perkIsActive(p, now));
}

export function hasActivePerk(
  perks: HousePerkView[],
  slug: HousePerkSlug,
  now: number = Date.now()
): boolean {
  return perks.some((p) => p.slug === slug && perkIsActive(p, now));
}
