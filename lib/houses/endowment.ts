/* THE ENDOWMENT: the way a member participates in a House economy.

   WHAT A HOUSE WAS, AND WHAT IT WAS MISSING

   A House already receives, spends and decides. It receives half of every
   burned Call stake under its banner (lib/calls/stake.ts, HOUSE_TITHE_BPS). It
   spends on a fixed catalogue of perks priced per sworn member
   (lib/houses/perks.ts). The Lord and the Hand decide, and they are the top two
   contributors this season rather than anybody's appointees.

   What a member could not do was take part. A treasury filled only by other
   people's losses, spent only by the two members at the top of a board, is a
   thing that happens near a member rather than a thing they are in. An
   endowment is the missing verb: a sworn member may give POINTS from their own
   balance to their House.

   THE RULE EVERY LINE HERE SERVES: NO HOUSE MINTS VALUE OUT OF NOTHING.

   An endowment moves points that already existed and destroys some of them. It
   never creates one. The member's balance falls by exactly the amount they
   committed; the treasury rises by less than that; the difference leaves the
   realm forever. Nothing anywhere is credited with the shortfall.

   WHY HALF IS BURNED ON THE WAY IN, WHICH IS THE ONLY REAL DESIGN CHOICE HERE

   The obvious version is a straight transfer: a member gives 500, the treasury
   gets 500. It is wrong for two separate reasons and only one of them is
   obvious.

   The obvious one is supply. The treasury exists because burned stakes are a
   sink, and a House is a record of what its members risked and lost. A
   frictionless transfer into it makes it a wallet instead. Worse, the Warden's
   Pardon pays POINTS back OUT of a treasury to members, so at a hundred
   percent efficiency in and fifty percent out, a House becomes a laundry:
   points cycle between members and the banner and the realm's supply never
   contracts. The stake tithe already answers exactly this question at exactly
   this ratio, and answering it differently at a second door would just tell
   everybody which door to use.

   The less obvious one is that a cheap endowment is a purchase. The Long Watch
   is the one perk that can move a House's standing, and if a member could
   convert their balance into treasury one for one, a member with a deep
   balance could simply buy their House a competitive advantage. At half, an
   endowment is strictly worse than staking the same points, because a stake
   can also come back and win. That is deliberate: endowing has to be a gift
   rather than an optimisation, or it stops being one.

   WHAT A MEMBER GETS FOR IT, AND WHAT THEY DELIBERATELY DO NOT

   They get the permanent public record. Every treasury inflow from a burned
   stake carries a null actor because nobody decided it; an endowment carries
   the giver's id, so the House's own audit trail names its benefactors and
   keeps naming them. They get the perks their House can then afford, which
   they are inside.

   They do NOT get Renown, which never falls and would therefore be minted
   permanent standing bought with a balance (the stake migration refuses this
   for the same reason). They do NOT get Glory, which is the standing the whole
   competition is measured in. And this is the one that matters most:

   AN ENDOWMENT MUST NEVER MOVE A MEMBER TOWARD LORD OR HAND. Those two titles
   are the only thing in the realm that can spend a treasury, and they are
   ranked on Glory by deriveLeadership in lib/houses/scoring.ts. A member who
   could buy their way up that ranking could buy the right to spend the
   treasury they had just filled, which is the "mint value out of nothing" line
   applied to power rather than to points, and it is the failure that would end
   the whole design. The mechanism is that an endowment writes a points delta
   and a glory delta of exactly zero, so there is no path from giving to
   ranking at all. Asserted at the bottom of this file, because it is a
   property nobody can see by reading the SQL.

   Pure and dependency free, with no `server-only` import, for the same reason
   lib/calls/stake.ts is: the dialog has to show a member exactly what reaches
   their House and exactly what is destroyed BEFORE they commit, and it has to
   be the same arithmetic the server runs. Nothing here is authoritative. Every
   figure is recomputed inside public.endow_house_treasury under the member's
   profile row lock and the House's row lock. */

/* ------------------------------------------------------------------
   The terms
   ------------------------------------------------------------------ */

/* What share of an endowment reaches the treasury, in basis points. The rest
   is destroyed.

   5000, the same as HOUSE_TITHE_BPS, and the sameness is the point: every
   POINT that enters a House treasury, by either door, leaves an equal POINT
   destroyed behind it. A member can hold the whole rule in one sentence, and
   there is no arbitrage between the two doors because there is no difference
   between them. */
export const ENDOWMENT_TREASURY_BPS = 5000;

/* The smallest endowment the realm will take.

   Half of it reaches the banner, so the floor is set at twice MIN_STAKE: the
   smallest gift that puts at least one minimum stake's worth into a treasury.
   Below that the row costs more to read than it carries, which is the same
   argument that set the stake floor. */
export const MIN_ENDOWMENT = 50;

/* The most one member may commit in a day.

   1000, deliberately identical to MAX_STAKE. The realm already has an opinion
   about how much of a balance may move in a single act, arrived at against the
   two daily allowances (social Renown at 200, War Glory at 1500), and it is
   "a little under a day's total honest earning at the very top end". An
   endowment moves a balance in exactly the same way, so it is held to exactly
   the same ceiling rather than to a second number nobody could justify.

   A ceiling matters more here than it does on a stake, because a stake can
   come back and an endowment cannot. Without one, a member sitting on a year
   of balance could fund their House's entire catalogue in a single afternoon,
   and the treasury would stop being a record of what the House did together.
   Per day rather than per act, so the ceiling cannot be walked around by
   sending it in ten pieces. */
export const DAILY_ENDOWMENT_CAP = 1000;

/* ------------------------------------------------------------------
   The split
   ------------------------------------------------------------------ */

export interface EndowmentSplit {
  /* What leaves the member's balance. */
  committed: number;
  /* What reaches the House treasury. */
  toTreasury: number;
  /* What is destroyed and can never be earned again by anyone. */
  destroyed: number;
}

/* Split one endowment.

   floor on the treasury share and a subtraction for the remainder, never two
   independent roundings. The two halves have to add back to exactly the
   committed amount or the realm quietly mints or destroys a point per gift,
   and a rounding remainder with nowhere to go is how a ledger ends up a point
   short of itself forever. The remainder goes to the burn rather than to the
   treasury, so an odd amount always errs toward destroying one more point than
   it pools: the direction that cannot inflate anything. */
export function splitEndowment(committed: number): EndowmentSplit {
  if (!Number.isInteger(committed) || committed < 0) {
    throw new Error(`An endowment must be a whole, positive number of POINTS, got ${committed}`);
  }
  const toTreasury = Math.floor((committed * ENDOWMENT_TREASURY_BPS) / 10_000);
  return { committed, toTreasury, destroyed: committed - toTreasury };
}

/* ------------------------------------------------------------------
   What the realm will take
   ------------------------------------------------------------------ */

export type EndowmentRefusal =
  | "not_a_number"
  | "not_positive"
  | "below_minimum"
  | "over_daily_cap"
  | "insufficient"
  | "not_sworn";

export const ENDOWMENT_REFUSAL_TEXT: Record<EndowmentRefusal, string> = {
  not_a_number: "An endowment has to be a number of POINTS.",
  not_positive: "An endowment has to be more than nothing.",
  below_minimum: `The smallest endowment the realm takes is ${MIN_ENDOWMENT} POINTS.`,
  over_daily_cap: `A member may commit ${DAILY_ENDOWMENT_CAP} POINTS to their House in a day, and you have reached it.`,
  insufficient: "You do not hold that many POINTS.",
  not_sworn: "Only a member sworn to this House may fill its treasury.",
};

export type EndowmentPlan =
  | { ok: true; split: EndowmentSplit }
  | { ok: false; reason: EndowmentRefusal; error: string };

function refuse(reason: EndowmentRefusal): EndowmentPlan {
  return { ok: false, reason, error: ENDOWMENT_REFUSAL_TEXT[reason] };
}

/* Decide whether this member may commit this many POINTS to this House.

   Pure, and takes the day's running total as an argument rather than reading a
   clock or a database, for the same reason lib/commerce/market.ts takes `nowMs`:
   a rule that reads the world is a rule whose refusals cannot be tested.

   THE BALANCE AND CAP TESTS HERE ARE COURTESY, NOT THE GUARANTEE. Two requests
   in the same instant can both pass this and only one of them can pass the
   profile row lock inside public.endow_house_treasury, which re-derives every
   one of these tests under the lock. The dialog needs to refuse before a
   member commits; the database needs to refuse when two of them do. */
export function planEndowment(args: {
  raw: unknown;
  balance: number;
  /* Everything this member has already committed today, across every House. */
  committedToday: number;
  sworn: boolean;
}): EndowmentPlan {
  if (!args.sworn) return refuse("not_sworn");

  if (typeof args.raw !== "number" || !Number.isFinite(args.raw)) {
    return refuse("not_a_number");
  }

  /* Truncated rather than rounded. Rounding a member's gift up would commit a
     POINT they did not offer, and rounding a fractional input at all means
     accepting a client that has been doing float arithmetic with a balance. */
  const committed = Math.trunc(args.raw);
  if (committed <= 0) return refuse("not_positive");
  if (committed < MIN_ENDOWMENT) return refuse("below_minimum");

  const alreadyGiven = Math.max(0, Math.trunc(args.committedToday));
  if (alreadyGiven + committed > DAILY_ENDOWMENT_CAP) return refuse("over_daily_cap");

  if (committed > Math.trunc(args.balance)) return refuse("insufficient");

  return { ok: true, split: splitEndowment(committed) };
}

/* The largest endowment this member could actually make right now, which is
   what the dialog's slider is bounded by. Zero when they cannot reach the
   floor, which is an honest "not yet" rather than a control that moves and
   then refuses. */
export function maxEndowmentFor(balance: number, committedToday: number): number {
  const remainingToday = DAILY_ENDOWMENT_CAP - Math.max(0, Math.trunc(committedToday));
  const affordable = Math.min(remainingToday, Math.trunc(balance));
  return affordable >= MIN_ENDOWMENT ? affordable : 0;
}

/* ------------------------------------------------------------------
   What a treasury may and may not do

   Written as data so the hall can render it and a test can assert it. Every
   entry is a real property of the schema and the RPCs, not an intention:
   the CANNOT list is enforced by the absence of any function that could do
   the thing, plus the check constraints named beside each one.
   ------------------------------------------------------------------ */

export const TREASURY_POWERS: { can: string[]; cannot: string[] } = {
  can: [
    "Receive half of every Call stake burned under its banner. The other half is destroyed.",
    "Receive half of any POINTS a sworn member endows. The other half is destroyed.",
    "Buy a perk from a fixed catalogue, priced per sworn member, decided by the Lord or the Hand.",
    "Pay a sworn member back part of a burned stake, but only out of a Warden's Pardon that was bought and ring-fenced in advance.",
  ],
  cannot: [
    "Be created, seeded, topped up or estimated. A House with no burns and no endowments holds exactly zero.",
    "Pay POINTS to any member outside a ring-fenced pardon, which is why a treasury cannot be shared out.",
    "Move to another House, or leave with a member who leaves.",
    "Be withdrawn to a wallet, converted, or quoted in any currency. It is not money and never was.",
    "Buy Renown or Glory, so no House can spend its way up the standings.",
    "Go below zero. Enforced by houses_treasury_check, not by the code that spends it.",
  ],
};

/* ------------------------------------------------------------------
   Module load assertions
   ------------------------------------------------------------------ */

/* The split adds back up to the whole, at every amount the realm will take.
   Exhaustive rather than sampled: the range is a thousand values and a gift
   that loses a POINT is exactly the bug nobody ever notices, because the
   amount missing is always small and always somebody else's. */
for (let n = MIN_ENDOWMENT; n <= DAILY_ENDOWMENT_CAP; n += 1) {
  const s = splitEndowment(n);
  if (s.toTreasury + s.destroyed !== n) {
    throw new Error(
      `An endowment of ${n} splits into ${s.toTreasury} and ${s.destroyed}, which is not ${n}. A split that loses or invents a POINT is not shippable.`
    );
  }
  /* The burn is never smaller than the pool. If it ever were, an endowment
     would be a cheaper way into a treasury than a burned stake, and every
     point in the realm would find that door. */
  if (s.destroyed < s.toTreasury) {
    throw new Error(
      `An endowment of ${n} destroys ${s.destroyed} and pools ${s.toTreasury}. Endowing must never be a cheaper door into a treasury than losing a stake.`
    );
  }
}

if (MIN_ENDOWMENT > DAILY_ENDOWMENT_CAP) {
  throw new Error("The endowment floor is above the daily ceiling, so no endowment is possible.");
}

/* The smallest legal endowment must still reach the treasury with something.
   A gift that pools nothing is a burn with a ceremony attached. */
if (splitEndowment(MIN_ENDOWMENT).toTreasury < 1) {
  throw new Error(
    `The smallest endowment of ${MIN_ENDOWMENT} pools nothing. Raise the floor or the share.`
  );
}
