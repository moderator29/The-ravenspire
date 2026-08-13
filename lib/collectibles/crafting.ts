import "server-only";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { RARITY_FLOOR_USD, type PackRarity } from "@/lib/commerce/catalog";
import { SET_ONE, type SetOneCard } from "@/lib/collectibles/set-one";
import { majorToMinor } from "@/lib/commerce/money";

/* CRAFTING: the card sink.
 *
 * WHY THIS EXISTS
 * The chest mints and nothing burns. A member who opens ten Knight's
 * Warchests holds fifty cards from a forty card set, so most of what they own
 * is a second, third or fourth copy of something they already have, and a
 * duplicate is worth exactly nothing to a collector who cannot do anything
 * with it. Crafting is the only thing in the realm that destroys cards: burn
 * copies of one rarity, forge one card of the rarity above.
 *
 * THE ONE RULE THAT MATTERS
 * A crafting ratio set too generously is not a feature, it is a mint. If N
 * copies of a rarity are worth less than the card they produce, then every
 * duplicate in the realm is a lottery ticket that pays out on demand, the
 * per rarity floor the platform stands behind stops being a floor, and the
 * chest's printed odds stop meaning anything because the cheap rarities
 * convert into the expensive ones. So a ratio here has to clear TWO bars, and
 * both are asserted at module load rather than argued in a comment:
 *
 *   1. IT DESTROYS FLOOR VALUE. N copies of `from` must be worth strictly more
 *      than one copy of `to`, against the real per rarity floor in
 *      lib/commerce/catalog.ts (rare 8, epic 22, legendary 60, mythic 275).
 *      More than strictly: at least SINK_MARGIN of the burned value has to
 *      disappear, because a ratio that only just clears the floor is a sink
 *      that rounds to zero.
 *
 *   2. IT IS NEVER CHEAPER THAN THE BOX. In a chest, the two rarities arrive
 *      together at a rate the odds table already fixes. The Squire's Chest
 *      deals 74% rare and 20% epic per card, so it hands out 3.7 rares for
 *      every epic. If crafting took 3 rares for an epic it would be a strictly
 *      better chest than the chest, with no variance at all, and nobody would
 *      ever open a box for an epic again. So every ratio must strictly exceed
 *      the most generous co-drop rate any tier offers for that step. Derived
 *      from CHEST_TIERS.odds rather than typed, so a retuned odds table
 *      breaks the build instead of quietly turning crafting into arbitrage.
 *
 * THE RATIOS, AND WHERE EACH NUMBER COMES FROM
 *
 *   4 rare      -> 1 epic       floor 32 destroys 22, keeps 31%.
 *                               Beats the Squire's 3.70 rares per epic.
 *   4 epic      -> 1 legendary  floor 88 destroys 60, keeps 32%.
 *                               Beats the Squire's 3.70 epics per legendary.
 *  10 legendary -> 1 mythic     floor 600 destroys 275, keeps 54%.
 *                               Beats the Squire's 9.0 legendaries per mythic.
 *
 * Ten is the number worth explaining, because it looks brutal until you price
 * it. The Knight's Warchest deals five cards at 2% mythic, so ten of them are
 * one mythic in expectation, and because every Knight's chest guarantees a
 * legendary floor, those same ten chests also guarantee the ten legendaries a
 * craft costs. The two paths cost the same and that is the point: crafting is
 * the floor under bad luck, never a cheaper route than good luck. Six or seven
 * would have made the craft strictly better than opening boxes for the top
 * rarity, which is precisely how a collectibles economy inflates to nothing.
 *
 * CRAFTING IS A CHOICE, NOT A ROLL
 * The member names the card they are forging. That is deliberate, and it is
 * what the premium above the chest's own rate buys: the chest sells you
 * randomness cheaply, crafting sells you certainty dearly. A crafting bench
 * that rolled would be a strictly worse chest, and nobody would feed it. It
 * also means there is nothing here to distrust: no seed, no commitment, no
 * reveal, because there is no randomness to prove fair.
 *
 * WHAT CANNOT COME OUT
 * The forged card is looked up in the real set (lib/collectibles/set-one.ts,
 * derived from the champion roster) and is refused if it is not a card of the
 * target rarity in that set. A craft can no more invent a card than a chest
 * can. This is the same discipline as lib/collectibles/pulls.ts and it is
 * tested exhaustively rather than sampled.
 *
 * WHAT THIS MODULE IS NOT
 * It is not the transaction. Deciding a craft is legal and performing one
 * indivisibly are different jobs, and mixing them is how you get a rule you
 * cannot test. Everything here is pure: no clock, no database, no randomness.
 * public.craft_cards burns and forges under a row lock, and enforces the one
 * rung step again at the database edge so no bug in a route can mint a mythic
 * out of rares.
 */

/* The rarity ladder, low to high. The same four rungs the chest rolls against
   and the same four the inventory table's rarity constraint allows. `common`
   is not on it: no Set One card is common, so nothing can be crafted from or
   into one. */
export const CRAFT_LADDER: PackRarity[] = [
  "rare",
  "epic",
  "legendary",
  "mythic",
];

export interface CraftStep {
  from: PackRarity;
  /* Exactly one rung above `from`. Enforced at module load and again in
     public.craft_cards, because "the rarity above" is the whole rule and a
     step that skipped a rung would be a different product. */
  to: PackRarity;
  /* How many copies of `from` one copy of `to` costs. */
  burn: number;
}

/* The rule. Read the header for where each number comes from. */
export const CRAFT_STEPS: CraftStep[] = [
  { from: "rare", to: "epic", burn: 4 },
  { from: "epic", to: "legendary", burn: 4 },
  { from: "legendary", to: "mythic", burn: 10 },
];

/* The least a craft may destroy, as a share of what it burns. A ratio that
   clears the floor by a dollar is arithmetically a sink and economically not
   one: it would take a rounding error, or a single revision to the per rarity
   floor, to turn it into a printer. A fifth of the burned value is the margin
   that makes the sink survive a founder changing their mind about a floor. */
export const SINK_MARGIN = 0.2;

export interface CraftSink {
  /* All amounts in USD minor units, because money in this codebase is always
     an integer count of cents (lib/commerce/money.ts). Nothing here charges
     anybody, but a floor value is money and it is not going to be the one
     float in the product. */
  burnedMinor: number;
  forgedMinor: number;
  destroyedMinor: number;
  /* The share of the burned floor value that ceases to exist, 0 to 1. */
  destroyedShare: number;
}

/* What one craft costs the realm's floor value. Derived from the founder's
   per rarity floor, never typed, so a revised floor moves this and trips the
   assertions below rather than silently changing the economy. */
export function sinkFor(step: CraftStep): CraftSink {
  const burnedMinor = majorToMinor(RARITY_FLOOR_USD[step.from]) * step.burn;
  const forgedMinor = majorToMinor(RARITY_FLOOR_USD[step.to]);
  const destroyedMinor = burnedMinor - forgedMinor;
  return {
    burnedMinor,
    forgedMinor,
    destroyedMinor,
    destroyedShare: destroyedMinor / burnedMinor,
  };
}

/* The most generous rate any chest offers for a step: how many copies of the
   lower rarity a member receives, in expectation, for each copy of the higher
   one, at the tier where that trade is best for them.
 *
 * This is the bar a crafting ratio has to beat. Read from the printed odds
 * themselves rather than from a copy of them, which is the same discipline
 * lib/commerce/catalog.ts applies to the chest floors: the table on the box
 * and the table the rule is checked against are one object. */
export function chestCoDropRate(from: PackRarity, to: PackRarity): number {
  let best = 0;
  for (const tier of CHEST_TIERS) {
    const lower = tier.odds[from] ?? 0;
    const upper = tier.odds[to] ?? 0;
    /* A tier that never deals the higher rarity offers no rate at all, rather
       than an infinite one. Nothing in the catalog is shaped that way today,
       but a future tier could be, and a division by zero here would read as a
       ratio no craft could ever satisfy. */
    if (upper <= 0) continue;
    best = Math.max(best, lower / upper);
  }
  return best;
}

/* The card as the holdings ledger stores it, which is the shape public.inventory
   takes and the shape chest_open writes. Identical to the four fields of a
   PulledCard minus the guarantee mark, and deliberately its own type: a card
   somebody forged did not come out of a chest and must not claim to have. */
export interface ForgedCard {
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: PackRarity;
}

/* Every set a craft may act inside. One today. Named as a list rather than
   assumed, so a second set cannot accidentally inherit Set One's cards: a
   craft is scoped to one set, because a member burning four rares of Set One
   is owed a Set One epic and nothing else. */
const SETS = [SET_ONE];

function setBySlug(slug: string) {
  return SETS.find((s) => s.slug === slug) ?? null;
}

/* The cards a craft may produce, per set and rarity. Indexed once at module
   load from the real set, so a target is looked up rather than trusted. */
const TARGETS = new Map<string, SetOneCard[]>();
for (const set of SETS) {
  for (const rarity of CRAFT_LADDER) {
    TARGETS.set(
      `${set.slug}:${rarity}`,
      set.cards.filter((card) => card.champion.rarity === rarity)
    );
  }
}

/* What a member may forge at a given rarity, in collector order. The crafting
   surface renders exactly this list, so a member can never be offered a card
   the rule would then refuse. */
export function craftTargets(setSlug: string, rarity: PackRarity): SetOneCard[] {
  return TARGETS.get(`${setSlug}:${rarity}`) ?? [];
}

/* The step that starts at a rarity, or null at the top of the ladder. */
export function craftStepFrom(rarity: string): CraftStep | null {
  return CRAFT_STEPS.find((s) => s.from === rarity) ?? null;
}

/* One copy, as the ledger holds it and as the route reads it back. Only the
   three fields the rule actually judges: whose it is has already been decided
   by the query that fetched it, and is decided again under a lock inside
   public.craft_cards. */
export interface CraftCopy {
  id: string;
  set_slug: string;
  rarity: string;
}

/* Why a craft was refused. A closed union rather than a string, so the route
   and this module cannot drift on the reasons, and so a test can assert the
   exact refusal instead of the fact that something went wrong. */
export type CraftRefusal =
  | "unknown_set"
  | "unknown_rarity"
  | "top_of_ladder"
  | "wrong_count"
  | "duplicate_copy"
  | "wrong_set"
  | "wrong_rarity"
  | "unknown_target";

export type CraftPlan =
  | {
      ok: true;
      step: CraftStep;
      /* The copies to burn, in the order the caller named them, deduplicated
         by construction: the plan is only ok when every id is distinct. */
      burnIds: string[];
      forged: ForgedCard;
      sink: CraftSink;
    }
  | { ok: false; reason: CraftRefusal };

/* Decide a craft. Pure: give it the copies the ledger actually holds and the
   card the member asked for, and it answers whether that is a legal craft and
   exactly what would come out.
 *
 * The caller has already scoped the copies to the member. This does not, and
 * cannot, check ownership: a pure function has no way to know whose rows those
 * are. Ownership is the route's job and the row lock's job, and it is checked
 * in both places rather than assumed in either. */
export function planCraft(args: {
  setSlug: string;
  fromRarity: string;
  /* The copies named by the member, already read back from the ledger. */
  copies: CraftCopy[];
  /* The champion the member wants forged. Never a rarity, never a card
     number: those are derived from the set, because a client that can name a
     card number can name any card it likes. */
  targetChampionSlug: string;
}): CraftPlan {
  const { setSlug, fromRarity, copies, targetChampionSlug } = args;

  const set = setBySlug(setSlug);
  if (!set) return { ok: false, reason: "unknown_set" };

  if (!(CRAFT_LADDER as string[]).includes(fromRarity)) {
    return { ok: false, reason: "unknown_rarity" };
  }

  const step = craftStepFrom(fromRarity);
  /* Mythic is the top of the ladder and there is nothing above it. Refused by
     name rather than by "no step found", because a member at the top of the
     ladder deserves a sentence that says so. */
  if (!step) return { ok: false, reason: "top_of_ladder" };

  if (copies.length !== step.burn) return { ok: false, reason: "wrong_count" };

  /* The double spend, and the one that would actually have worked. Naming one
     copy four times reads as four copies to anything counting the array, and
     a delete keyed on `id = any(...)` removes it once. The set of distinct ids
     is what has to be the right size, here and again in the transaction. */
  const ids = new Set(copies.map((c) => c.id));
  if (ids.size !== step.burn) return { ok: false, reason: "duplicate_copy" };

  for (const copy of copies) {
    /* A craft happens inside one set. Burning three Set One rares and a rare
       from a future set to forge a Set One epic would let the cheapest set in
       the realm subsidise the dearest one. */
    if (copy.set_slug !== setSlug) return { ok: false, reason: "wrong_set" };
    if (copy.rarity !== fromRarity) return { ok: false, reason: "wrong_rarity" };
  }

  /* The forged card comes out of the real set, at the step's own target
     rarity. A champion who exists but is the wrong rarity is refused, which
     is what stops "craft four rares, name a mythic" from working. */
  const target = craftTargets(setSlug, step.to).find(
    (card) => card.champion.slug === targetChampionSlug
  );
  if (!target) return { ok: false, reason: "unknown_target" };

  return {
    ok: true,
    step,
    burnIds: copies.map((c) => c.id),
    forged: {
      set_slug: set.slug,
      card_number: target.number,
      champion_slug: target.champion.slug,
      rarity: step.to,
    },
    sink: sinkFor(step),
  };
}

/* ------------------------------------------------------------------
   Module load assertions.

   Everything below runs once, at import, and throws. A crafting ratio that
   prints money must break the build, not ship: by the time anybody notices
   the realm's floor value is wrong, the cards are already in members' hands
   and there is no honest way to take them back. This is the same posture
   warchests.ts takes with odds that do not sum to 100 and catalog.ts takes
   with a chest that costs more than its floor.
   ------------------------------------------------------------------ */

for (let i = 0; i < CRAFT_LADDER.length - 1; i += 1) {
  const from = CRAFT_LADDER[i];
  const to = CRAFT_LADDER[i + 1];

  /* The floor has to rise up the ladder or "the rarity above" means nothing
     and a sink cannot exist at all. */
  if (RARITY_FLOOR_USD[to] <= RARITY_FLOOR_USD[from]) {
    throw new Error(
      `The floor for ${to} is not above ${from}. The rarity ladder and the floor ladder must agree.`
    );
  }

  const step = CRAFT_STEPS.find((s) => s.from === from);
  /* Every rung except the top starts a step. A gap would leave a rarity whose
     duplicates have nowhere to go, which is the exact problem this exists to
     solve. */
  if (!step) {
    throw new Error(
      `No craft step burns ${from}. Every rarity below the top of the ladder needs a sink.`
    );
  }
  if (step.to !== to) {
    throw new Error(
      `The ${from} craft forges ${step.to}, which is not one rung up. Crafting moves a card up exactly one rarity.`
    );
  }
}

if (CRAFT_STEPS.some((s) => s.from === CRAFT_LADDER[CRAFT_LADDER.length - 1])) {
  throw new Error(
    "A craft step burns the top rarity. There is nothing above it to forge."
  );
}

for (const step of CRAFT_STEPS) {
  if (!Number.isInteger(step.burn) || step.burn < 2) {
    throw new Error(
      `The ${step.from} craft burns ${step.burn} copies. A sink burns at least two whole cards.`
    );
  }

  /* Bar one: the craft destroys floor value, by a real margin. */
  const sink = sinkFor(step);
  if (sink.destroyedShare < SINK_MARGIN) {
    throw new Error(
      `Crafting ${step.burn} ${step.from} into one ${step.to} destroys only ` +
        `${(sink.destroyedShare * 100).toFixed(1)}% of the floor value it burns. ` +
        `A sink that keeps less than ${SINK_MARGIN * 100}% is a mint with extra steps.`
    );
  }

  /* Bar two: the craft is never a cheaper route to a rarity than the box that
     sells it. Strictly greater, because a deterministic trade at the chest's
     own rate is better than the chest, having no variance. */
  const rate = chestCoDropRate(step.from, step.to);
  if (step.burn <= rate) {
    throw new Error(
      `Crafting ${step.burn} ${step.from} into one ${step.to} beats the chest, ` +
        `which deals ${rate.toFixed(2)} ${step.from} per ${step.to} at its most ` +
        `generous tier. A craft must never be a cheaper ${step.to} than a Warchest.`
    );
  }

  /* A step with nothing to forge is a promise the bench cannot keep. */
  for (const set of SETS) {
    if (craftTargets(set.slug, step.to).length === 0) {
      throw new Error(
        `Set ${set.slug} holds no ${step.to} cards, so a ${step.from} craft has nothing to produce.`
      );
    }
  }
}
