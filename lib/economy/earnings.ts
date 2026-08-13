/* THE COFFERS: one statement, folded from row level facts, reconciled.

   WHAT WAS WRONG
   A member who brought people in, called a coin that resolved well, or sold a
   card, earned. Every one of those settled its own way and none of them added
   up anywhere a member could read. `/api/profile/earnings` was the closest
   thing and it was quietly wrong in four places at once, which is what happens
   to a total nothing reconciles: it summed `tips.points`, a column that has
   been null on every row since tributes became on chain transfers, so the Tips
   figure was structurally zero; it looked for referral rewards under a reason
   prefix that nothing has ever written (the reason is `banner_raised`), so
   referrals read as zero and landed in Other; it added the negative row a
   staked Call writes at escrow into a figure labelled "points earned", so
   staking a Call made a member's lifetime earnings fall; and its breakdown
   filtered to positives while its total did not, so the slices and the number
   above them could not agree.

   None of those were careless. They are what a derived total does when nothing
   checks it against the balance it claims to explain.

   THE RULE THIS MODULE ENFORCES
   Every figure traces to a row, and the rows have to add up to the balance. A
   statement that cannot be reconciled against `profiles.points` is reported as
   unreconciled rather than rendered as if it were fine. `points_ledger` is the
   source of truth and `profiles.points` is a cached total (see lib/points.ts),
   so a drift between them is a real fact about the realm and the member is the
   person most entitled to see it.

   TWO LEDGERS THAT ARE NEVER ADDED TOGETHER
   This module folds the POINTS ledger only. POINTS are a realm score. They
   convert to $RSP at TGE, and no rate is set, so a POINT is never quoted here
   as an amount of $RSP or of money. The other half of a member's earnings is
   real value that has already moved to their own wallet, in tokens and in
   dollars, and it lives in lib/economy/coffers.ts as a separate ledger with
   separate units. Summing them would produce a single number that means
   nothing, which is the failure mode this whole module exists to close.

   PURE, AND DELIBERATELY WITHOUT `server-only`. The Coffers surface renders
   the same fold the route computes, so the arithmetic a member reads and the
   arithmetic the server publishes are one function rather than two that agree
   until they do not. Nothing here is authoritative: the balance is
   `profiles.points`, written under a row lock by the RPCs in
   supabase/migrations/, and this is the explanation of it. */

/* ------------------------------------------------------------------
   The rows
   ------------------------------------------------------------------ */

/* One `points_ledger` row, as the table actually holds it. `id` is carried
   because deduplication needs a key: see foldStatement. */
export interface LedgerRow {
  id: string;
  points_delta: number;
  glory_delta: number;
  reason: string;
  category: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------
   Streams
   ------------------------------------------------------------------ */

/* What a member did to earn it, in their language.

   `other` is a real bucket and not a bug. A reason this table does not know is
   still a real row carrying real points, and dropping it would put the
   statement out of balance with the member's own balance, which is the one
   thing this module refuses to do. So an unknown reason is counted, labelled
   honestly, and shows up in the reconciliation as itself. */
export type StreamSlug =
  | "ravens"
  | "calls"
  | "war"
  | "quests"
  | "muster"
  | "banners"
  | "arrival"
  | "other";

export const STREAM_LABEL: Record<StreamSlug, string> = {
  ravens: "Ravens",
  calls: "Calls",
  war: "The War",
  quests: "Quests",
  muster: "The Muster",
  banners: "Banners raised",
  arrival: "Taking the black",
  other: "Other",
};

/* Reason to stream. Exact matches first, then the two prefix families.

   Written as data rather than as a switch so the mapping can be read as a
   table and tested as one. `liked_by_<id>` and `quest_<slug>` carry an
   identifier in the reason itself, which is why they cannot be exact keys. */
const EXACT_STREAM: Record<string, StreamSlug> = {
  sent_a_raven: "ravens",
  replied: "ravens",
  sealed_a_call: "calls",
  call_hit: "calls",
  call_resolved: "calls",
  war_fought: "war",
  war_victory: "war",
  war_daily: "war",
  duel_won: "war",
  duel_vote: "war",
  top_of_ladder: "war",
  muster: "muster",
  banner_raised: "banners",
  banner_answered: "banners",
  took_the_black: "arrival",
};

export function streamFor(reason: string): StreamSlug {
  const exact = EXACT_STREAM[reason];
  if (exact) return exact;
  if (reason.startsWith("liked_by_")) return "ravens";
  if (reason.startsWith("quest_")) return "quests";
  return "other";
}

/* ------------------------------------------------------------------
   The categories that are not earnings
   ------------------------------------------------------------------ */

/* `points_ledger.category` values that describe a balance MOVING rather than a
   balance being earned. Both are excluded from the earned and spent figures
   and reported on their own, because a stake escrow is not a loss and a
   returned stake is not an earning: counting either as one is exactly the bug
   at the top of this file.

   These strings are the live check constraint's own values. The constraint
   allows ('social', 'call', 'war', 'stake', 'house'); the first three are
   allowances and are earnings, the last two are movements. */
export const MOVEMENT_CATEGORIES = ["stake", "house"] as const;

function isMovement(category: string | null): boolean {
  return (MOVEMENT_CATEGORIES as readonly string[]).includes(category ?? "");
}

/* ------------------------------------------------------------------
   The statement
   ------------------------------------------------------------------ */

export interface StreamTotal {
  slug: StreamSlug;
  label: string;
  points: number;
  glory: number;
  events: number;
}

/* What staking has done to a balance, as the LEDGER can see it.

   WHAT THIS BLOCK DELIBERATELY DOES NOT CARRY: how much is escrowed right now,
   and how much has burned. Neither is derivable from `points_ledger` and
   pretending otherwise is how a statement invents a figure. A burn writes no
   ledger row at all: the points left at escrow and simply never come back, so
   "staked minus returned" is open stakes and burns added together and is
   neither. Both facts live one table over, in `call_stakes`, which records the
   status and the burn on the row, and the server read carries them across from
   there. See lib/economy/coffers.ts. */
export interface StakeBlock {
  /* Everything ever put at risk behind a Call, positive magnitude. */
  staked: number;
  /* Everything a settlement paid back: the stake and its bonus, or the bare
     stake on a void. */
  returned: number;
  /* Paid back out of a House treasury by the Warden's Pardon. Named separately
     because it is the one POINT in the realm that reaches a member from a
     House rather than from an award. */
  pardoned: number;
  /* returned + pardoned - staked. Negative is the ordinary state for a member
     holding open Calls and it is not a loss: it is money still on the table. */
  net: number;
}

export interface EarningsStatement {
  /* Every positive point the member was awarded, ever, across every stream.
     This is the figure The Coffers calls "earned" and it is the only figure
     entitled to that word. */
  earned: number;
  /* Every point spent on something that is not a stake or a House. Zero
     today, because nothing in the realm spends POINTS that way yet, and it is
     computed rather than assumed so the day something does, it appears. */
  spent: number;
  stakes: StakeBlock;
  /* POINTS committed to a House treasury, positive magnitude. Given away, not
     spent and not lost: see lib/houses/endowment.ts. */
  given: number;
  /* The sum of every delta in the ledger, which is what the member's balance
     must equal. Not a headline figure: a reconciliation target. */
  net: number;
  glory: number;
  streams: StreamTotal[];
  events: number;
  firstAt: string | null;
  lastAt: string | null;
  /* Rows the fold saw more than once and counted once. A paginated read that
     overlaps its own page boundary delivers a duplicate, and a statement that
     counted it would drift from the balance by exactly that row. */
  duplicates: number;
}

/* Fold a member's whole POINTS ledger into one statement.

   DEDUPLICATION IS NOT DEFENSIVE PROGRAMMING HERE. The rows arrive from a
   paginated read ordered by `created_at`, and `created_at` is not unique: two
   awards written in the same microsecond straddle a page boundary and the
   second page repeats one. Counting it twice would put the statement out of
   balance with `profiles.points` and the surface would report a drift that
   does not exist, which is worse than reporting nothing, because it accuses
   the realm of losing a member's points.

   A NON INTEGER DELTA THROWS. `points_delta` is an integer column and a
   fractional one can only mean the row was constructed rather than read. The
   money rule in lib/commerce/money.ts is the same rule and for the same
   reason: a statement is arithmetic about somebody's balance and it does not
   get to silently round. */
export function foldStatement(rows: LedgerRow[]): EarningsStatement {
  const seen = new Set<string>();
  let duplicates = 0;

  let earned = 0;
  let spent = 0;
  let given = 0;
  let net = 0;
  let glory = 0;
  let staked = 0;
  let returned = 0;
  let pardoned = 0;
  let stakeNet = 0;
  let events = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  const byStream = new Map<StreamSlug, StreamTotal>();

  for (const row of rows) {
    if (seen.has(row.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(row.id);

    const points = row.points_delta;
    const gloryDelta = row.glory_delta;
    if (!Number.isInteger(points) || !Number.isInteger(gloryDelta)) {
      throw new Error(
        `Ledger row ${row.id} carries a non integer delta (${points}, ${gloryDelta}). A balance is counted in whole POINTS.`
      );
    }

    /* Every row moves the balance, including the ones that are not earnings.
       This is the reconciliation target and it is deliberately computed before
       any classification, so no branch below can leave a row out of it. */
    net += points;
    glory += gloryDelta;

    if (points !== 0 || gloryDelta !== 0) {
      events += 1;
      if (firstAt === null || row.created_at < firstAt) firstAt = row.created_at;
      if (lastAt === null || row.created_at > lastAt) lastAt = row.created_at;
    }

    if (isMovement(row.category)) {
      if (row.category === "house") {
        /* An endowment is the only thing writing this category, and it is
           always an outflow. Recorded by magnitude so the surface never has to
           decide what a minus sign in a gift means. */
        given += points < 0 ? -points : 0;
      } else {
        stakeNet += points;
        if (points < 0) staked += -points;
        else if (row.reason === "wardens_pardon") pardoned += points;
        else returned += points;
      }
      continue;
    }

    if (points > 0) earned += points;
    else if (points < 0) spent += -points;

    const slug = streamFor(row.reason);
    const bucket = byStream.get(slug) ?? {
      slug,
      label: STREAM_LABEL[slug],
      points: 0,
      glory: 0,
      events: 0,
    };
    bucket.points += points;
    bucket.glory += gloryDelta;
    bucket.events += 1;
    byStream.set(slug, bucket);
  }

  /* Largest first, so the surface reads as a ranking without sorting it again.
     A stream that nets to zero is kept: "you earned nothing from the War" is a
     true and useful line, and dropping it would make the list disagree with
     the event count beside it. */
  const streams = [...byStream.values()].sort((a, b) => b.points - a.points);

  return {
    earned,
    spent,
    stakes: { staked, returned, pardoned, net: stakeNet },
    given,
    net,
    glory,
    streams,
    events,
    firstAt,
    lastAt,
    duplicates,
  };
}

/* ------------------------------------------------------------------
   Reconciliation
   ------------------------------------------------------------------ */

export interface Reconciliation {
  /* What `profiles.points` says the member holds. */
  cached: number;
  /* What the ledger's own rows add up to. */
  ledger: number;
  /* cached minus ledger. Zero is the only healthy value. */
  drift: number;
  reconciled: boolean;
  /* True when the ledger read was truncated, in which case a drift means
     nothing and must not be reported as one. A statement folded from the first
     two thousand of five thousand rows will always disagree with the balance,
     and calling that a discrepancy would cry wolf at every heavy user in the
     realm. */
  partial: boolean;
}

export function reconcile(args: {
  cached: number;
  ledgerNet: number;
  partial: boolean;
}): Reconciliation {
  const cached = Math.trunc(args.cached);
  const ledger = Math.trunc(args.ledgerNet);
  const drift = cached - ledger;
  return {
    cached,
    ledger,
    drift,
    /* A partial read can never be called reconciled, because it was not
       checked. Honest uncertainty, not a green tick by default. */
    reconciled: !args.partial && drift === 0,
    partial: args.partial,
  };
}

/* The sentence a member reads. Written here rather than in the component so
   the API and the surface cannot describe the same numbers differently. */
export function reconciliationLine(r: Reconciliation): string {
  if (r.partial) {
    return "Your ledger is longer than one page, so this statement covers the most recent entries and is not checked against your balance.";
  }
  if (r.reconciled) {
    return "Every POINT in your balance is accounted for by an entry below.";
  }
  const magnitude = Math.abs(r.drift).toLocaleString();
  return r.drift > 0
    ? `Your balance holds ${magnitude} POINTS more than the entries below explain. The realm has been told.`
    : `The entries below account for ${magnitude} POINTS more than your balance holds. The realm has been told.`;
}
