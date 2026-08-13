import { describe, it, expect } from "vitest";
import {
  CRAFT_LADDER,
  CRAFT_STEPS,
  SINK_MARGIN,
  chestCoDropRate,
  craftStepFrom,
  craftTargets,
  planCraft,
  sinkFor,
  type CraftCopy,
  type CraftStep,
} from "@/lib/collectibles/crafting";
import { RARITY_FLOOR_USD } from "@/lib/commerce/catalog";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { majorToMinor } from "@/lib/commerce/money";

/* Crafting is the only thing in the realm that destroys a card, and the ratio
   it destroys them at is the difference between a sink and a printer. Every
   test here is a way somebody gets hurt if the rule is wrong.

   Two of them are the reason this file exists. "The sink genuinely destroys
   value" is the one that protects the per rarity floor the platform commits
   to standing behind: get it backwards and every duplicate in the realm
   becomes a claim on the treasury. "A craft can only produce a card that
   exists" is the one that protects the set: a card minted out of nothing is
   permanent, and if it has been claimed on-chain it is permanent everywhere.

   The module also asserts most of this at import time, which means a bad ratio
   breaks the build rather than reaching a member. These tests cover what a
   module load check cannot: that the numbers are the ones actually decided,
   and that planCraft refuses every shape of malformed craft rather than
   quietly forging something. */

const [RARE_STEP, EPIC_STEP, LEGENDARY_STEP] = CRAFT_STEPS;

/* A copy as the ledger holds it. Ids are the only thing the caller names, so
   the tests name them the way a route would: whatever the database handed
   back. The set and the rarity are both in the id because two calls to this
   helper are often concatenated into one pile, and ids that collided across
   those calls made a mixed-set pile look like a duplicate-copy one. That is
   the test lying about which rule caught it, which is worse than the test
   failing. */
function copies(n: number, rarity: string, setSlug = SET_ONE.slug): CraftCopy[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `copy-${setSlug}-${rarity}-${i}`,
    set_slug: setSlug,
    rarity,
  }));
}

function firstTargetOf(step: CraftStep): string {
  return craftTargets(SET_ONE.slug, step.to)[0].champion.slug;
}

function plan(step: CraftStep, over: Partial<Parameters<typeof planCraft>[0]> = {}) {
  return planCraft({
    setSlug: SET_ONE.slug,
    fromRarity: step.from,
    copies: copies(step.burn, step.from),
    targetChampionSlug: firstTargetOf(step),
    ...over,
  });
}

describe("the craft ratios", () => {
  it("are the ratios that were decided", () => {
    /* Written out rather than derived, so a change to any of the three has to
       be made twice and thought about once. */
    expect(RARE_STEP).toEqual({ from: "rare", to: "epic", burn: 4 });
    expect(EPIC_STEP).toEqual({ from: "epic", to: "legendary", burn: 4 });
    expect(LEGENDARY_STEP).toEqual({ from: "legendary", to: "mythic", burn: 10 });
  });

  it("move a card up exactly one rung, and never off the top", () => {
    /* A step that skipped a rung would let four rares reach legendary at the
       price of an epic. A step off the top would burn mythics for nothing. */
    for (const step of CRAFT_STEPS) {
      const from = CRAFT_LADDER.indexOf(step.from);
      const to = CRAFT_LADDER.indexOf(step.to);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBe(from + 1);
    }
    expect(craftStepFrom("mythic")).toBeNull();
  });

  it("cover every rarity that can hold a duplicate", () => {
    /* A rarity with no step is a rarity whose duplicates still mean nothing,
       which is the whole problem crafting exists to solve. */
    for (const rarity of CRAFT_LADDER.slice(0, -1)) {
      expect(craftStepFrom(rarity)).not.toBeNull();
    }
  });
});

describe("the sink", () => {
  it("destroys more floor value than it creates, on every step", () => {
    /* THE load bearing test. If a step ever creates more than it burns, every
       duplicate in the realm is a lottery ticket that pays out on demand and
       the floor the platform stands behind is unfundable. */
    for (const step of CRAFT_STEPS) {
      const sink = sinkFor(step);
      expect(sink.burnedMinor).toBeGreaterThan(sink.forgedMinor);
      expect(sink.destroyedMinor).toBeGreaterThan(0);
    }
  });

  it("destroys at least the margin, not merely a cent", () => {
    /* A ratio that clears the floor by a rounding error is arithmetically a
       sink and economically not one. One revision to a per rarity floor would
       turn it into a printer with nothing failing. */
    for (const step of CRAFT_STEPS) {
      expect(sinkFor(step).destroyedShare).toBeGreaterThanOrEqual(SINK_MARGIN);
    }
  });

  it("prices each step against the founder's real floor", () => {
    /* The numbers, spelled out, so a silent change to RARITY_FLOOR_USD shows
       up here as well as in the assertions the module makes at import. */
    expect(sinkFor(RARE_STEP)).toMatchObject({
      burnedMinor: majorToMinor(8) * 4,
      forgedMinor: majorToMinor(22),
      destroyedMinor: 3200 - 2200,
    });
    expect(sinkFor(EPIC_STEP)).toMatchObject({
      burnedMinor: majorToMinor(22) * 4,
      forgedMinor: majorToMinor(60),
      destroyedMinor: 8800 - 6000,
    });
    expect(sinkFor(LEGENDARY_STEP)).toMatchObject({
      burnedMinor: majorToMinor(60) * 10,
      forgedMinor: majorToMinor(275),
      destroyedMinor: 60000 - 27500,
    });
  });

  it("stays a sink when the steps are chained all the way up", () => {
    /* The exploit a per step check misses. If each step is only just a sink,
       a member could still climb the ladder profitably by crafting rare to
       epic to legendary to mythic. Priced end to end: 160 rares, 1,280
       dollars of floor, for a 275 dollar mythic. */
    let rares = 1;
    for (const step of CRAFT_STEPS) rares *= step.burn;
    expect(rares).toBe(160);

    const burnedMinor = majorToMinor(RARITY_FLOOR_USD.rare) * rares;
    const forgedMinor = majorToMinor(RARITY_FLOOR_USD.mythic);
    expect(burnedMinor).toBeGreaterThan(forgedMinor);
    expect((burnedMinor - forgedMinor) / burnedMinor).toBeGreaterThan(SINK_MARGIN);
  });

  it("never beats the chest that sells the rarity", () => {
    /* If crafting were cheaper than the box's own co-drop rate, it would be a
       strictly better chest with no variance, and the printed odds would stop
       describing how anyone actually gets a legendary. */
    for (const step of CRAFT_STEPS) {
      expect(step.burn).toBeGreaterThan(chestCoDropRate(step.from, step.to));
    }
  });

  it("reads the co-drop rate off the printed odds, at the most generous tier", () => {
    /* Not a copy of the odds table: the same object the box prints. The
       Squire's Chest is the generous tier on all three steps, which is why
       these are the numbers the ratios had to beat. */
    const squire = CHEST_TIERS.find((t) => t.sku === "squires-chest");
    expect(squire).toBeDefined();
    expect(chestCoDropRate("rare", "epic")).toBeCloseTo(74 / 20, 6);
    expect(chestCoDropRate("epic", "legendary")).toBeCloseTo(20 / 5.4, 6);
    expect(chestCoDropRate("legendary", "mythic")).toBeCloseTo(5.4 / 0.6, 6);
  });

  it("keeps the floor ladder rising, which is what makes a sink possible", () => {
    for (let i = 0; i < CRAFT_LADDER.length - 1; i += 1) {
      expect(RARITY_FLOOR_USD[CRAFT_LADDER[i + 1]]).toBeGreaterThan(
        RARITY_FLOOR_USD[CRAFT_LADDER[i]]
      );
    }
  });
});

describe("planCraft", () => {
  it("forges the card the member named, at the rarity above", () => {
    for (const step of CRAFT_STEPS) {
      const result = plan(step);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.forged.rarity).toBe(step.to);
      expect(result.forged.set_slug).toBe(SET_ONE.slug);
      expect(result.burnIds).toHaveLength(step.burn);
    }
  });

  it("can only ever produce a card that exists in the set", () => {
    /* Exhaustive rather than sampled, because a card minted out of nothing is
       permanent, and once it has been claimed it is permanent on a public
       chain too. Every legal target of every step is checked against the
       roster the set derives from. */
    const known = new Map(SET_ONE.cards.map((c) => [c.champion.slug, c] as const));
    for (const step of CRAFT_STEPS) {
      const targets = craftTargets(SET_ONE.slug, step.to);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const result = plan(step, { targetChampionSlug: target.champion.slug });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const real = known.get(result.forged.champion_slug);
        expect(real).toBeDefined();
        /* The number and the rarity come from the roster, not from whatever
           the plan felt like stamping on them. */
        expect(result.forged.card_number).toBe(real?.number);
        expect(result.forged.rarity).toBe(real?.champion.rarity);
      }
    }
  });

  it("refuses a champion of the wrong rarity", () => {
    /* Burn four rares, name a mythic. The champion is real, which is exactly
       why a lookup by slug alone would have let this through. */
    const mythic = craftTargets(SET_ONE.slug, "mythic")[0].champion.slug;
    const result = plan(RARE_STEP, { targetChampionSlug: mythic });
    expect(result).toEqual({ ok: false, reason: "unknown_target" });
  });

  it("refuses a champion that does not exist", () => {
    expect(plan(RARE_STEP, { targetChampionSlug: "not-a-champion" })).toEqual({
      ok: false,
      reason: "unknown_target",
    });
  });

  it("refuses the same copy named more than once", () => {
    /* The double spend, and the only one of these that would actually have
       worked. Four references to one copy count as four to anything measuring
       the array, and a delete keyed on `id = any(...)` removes it once: one
       rare in, one epic out. */
    const one = copies(1, "rare")[0];
    const result = plan(RARE_STEP, { copies: [one, one, one, one] });
    expect(result).toEqual({ ok: false, reason: "duplicate_copy" });
  });

  it("refuses too few and too many copies alike", () => {
    /* Too few is theft from the realm. Too many is theft from the member, who
       would have burned five cards for a four card price and had no way to
       know. */
    expect(plan(RARE_STEP, { copies: copies(3, "rare") })).toEqual({
      ok: false,
      reason: "wrong_count",
    });
    expect(plan(RARE_STEP, { copies: copies(5, "rare") })).toEqual({
      ok: false,
      reason: "wrong_count",
    });
    expect(plan(RARE_STEP, { copies: [] })).toEqual({
      ok: false,
      reason: "wrong_count",
    });
  });

  it("refuses a copy of a different rarity in the pile", () => {
    /* Three rares and one legendary for an epic: the member pays 84 dollars of
       floor for a 22 dollar card, and the realm has quietly burned a legendary
       at a rare's price. Wrong in both directions. */
    const mixed = [...copies(3, "rare"), ...copies(1, "legendary")];
    expect(plan(RARE_STEP, { copies: mixed })).toEqual({
      ok: false,
      reason: "wrong_rarity",
    });
  });

  it("refuses a copy from another set", () => {
    /* A craft belongs to one set. Otherwise the cheapest set in the realm
       subsidises the dearest, and a member burning Set Two rares walks away
       with a Set One epic. */
    const mixed = [...copies(3, "rare"), ...copies(1, "rare", "set-two")];
    expect(plan(RARE_STEP, { copies: mixed })).toEqual({
      ok: false,
      reason: "wrong_set",
    });
  });

  it("refuses a set nobody has printed", () => {
    expect(
      planCraft({
        setSlug: "set-two",
        fromRarity: "rare",
        copies: copies(4, "rare", "set-two"),
        targetChampionSlug: firstTargetOf(RARE_STEP),
      })
    ).toEqual({ ok: false, reason: "unknown_set" });
  });

  it("refuses to craft off the top of the ladder", () => {
    /* Ten mythics in and nothing out. Refused by name so the bench can say
       why rather than reporting a generic failure. */
    expect(
      planCraft({
        setSlug: SET_ONE.slug,
        fromRarity: "mythic",
        copies: copies(10, "mythic"),
        targetChampionSlug: craftTargets(SET_ONE.slug, "mythic")[0].champion.slug,
      })
    ).toEqual({ ok: false, reason: "top_of_ladder" });
  });

  it("refuses a rarity that is not on the ladder", () => {
    /* `common` is a real rarity in the game and is on no Set One card. It must
       not fall through to a step by accident. */
    expect(
      planCraft({
        setSlug: SET_ONE.slug,
        fromRarity: "common",
        copies: copies(4, "common"),
        targetChampionSlug: firstTargetOf(RARE_STEP),
      })
    ).toEqual({ ok: false, reason: "unknown_rarity" });
  });

  it("hands back exactly the copies it was given, and no others", () => {
    /* The route passes these ids straight into the burn, so a plan that
       reordered, dropped or invented one would burn the wrong cards. */
    const pile = copies(4, "rare");
    const result = plan(RARE_STEP, { copies: pile });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.burnIds).toEqual(pile.map((c) => c.id));
  });
});

describe("craftTargets", () => {
  it("offers only cards of the asked rarity, from the asked set", () => {
    /* The bench renders this list, so anything wrong in it is a card a member
       is invited to forge and then refused. */
    for (const rarity of CRAFT_LADDER) {
      for (const card of craftTargets(SET_ONE.slug, rarity)) {
        expect(card.champion.rarity).toBe(rarity);
      }
    }
    expect(craftTargets("set-two", "epic")).toEqual([]);
  });

  it("covers the whole set between them", () => {
    /* Every card in Set One is craftable or is on the bottom rung. A card in
       no list would be one nobody could ever forge, silently. */
    const listed = CRAFT_LADDER.flatMap((r) => craftTargets(SET_ONE.slug, r));
    expect(listed).toHaveLength(SET_ONE.counts.total);
  });
});
