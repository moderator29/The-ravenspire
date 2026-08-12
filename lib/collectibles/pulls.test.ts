import { describe, it, expect } from "vitest";
import { rollChest, seedHash } from "@/lib/collectibles/pulls";
import { CHEST_TIERS, type ChestTier } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";

/* A chest is a promise printed on a box, and this is the code that keeps it.
   Everything asserted here is something a member could reasonably feel cheated
   by if it were wrong: the count, the floor, the odds, and the claim that
   anyone can rerun the roll and get the same cards.

   Determinism is the load bearing one. If the same three inputs ever produced
   two different chests, the verifier page would call an honest opening a
   forgery, and there would be no way to tell that from the other direction. */

const tiers = new Map(CHEST_TIERS.map((t) => [t.sku, t] as const));
const squire = tiers.get("squires-chest") as ChestTier;
const knight = tiers.get("knights-warchest") as ChestTier;

const SERVER_SEED = "a".repeat(64);

function roll(tier: ChestTier, clientSeed: string, nonce: string) {
  return rollChest({ tier, serverSeed: SERVER_SEED, clientSeed, nonce });
}

const RANK = ["rare", "epic", "legendary", "mythic"];

describe("rollChest", () => {
  it("deals exactly what the box says", () => {
    for (const tier of CHEST_TIERS) {
      const result = roll(tier, "client", "nonce-1");
      expect(result.cards).toHaveLength(tier.cardCount);
    }
  });

  it("is deterministic in all three inputs", () => {
    const a = roll(squire, "client", "nonce-1");
    const b = roll(squire, "client", "nonce-1");
    expect(b).toEqual(a);
  });

  it("gives a different chest for a different nonce or client seed", () => {
    /* Same seed, different opening. If these matched, one entitlement's roll
       would predict every other one the member ever opens. */
    const base = roll(knight, "client", "nonce-1");
    const otherNonce = roll(knight, "client", "nonce-2");
    const otherClient = roll(knight, "other-client", "nonce-1");
    expect(otherNonce.cards).not.toEqual(base.cards);
    expect(otherClient.cards).not.toEqual(base.cards);
  });

  it("only ever deals cards that exist in the set", () => {
    const known = new Map(
      SET_ONE.cards.map((c) => [c.champion.slug, c] as const)
    );
    for (let i = 0; i < 200; i += 1) {
      for (const card of roll(knight, "client", `nonce-${i}`).cards) {
        const real = known.get(card.champion_slug);
        expect(real).toBeDefined();
        /* The number and the rarity must come from the roster too, not from
           whatever the roll felt like stamping on them. */
        expect(card.card_number).toBe(real?.number);
        expect(card.rarity).toBe(real?.champion.rarity);
        expect(card.set_slug).toBe(SET_ONE.slug);
      }
    }
  });

  it("keeps the printed guarantee in every chest, every time", () => {
    for (const tier of CHEST_TIERS) {
      const floorRank = RANK.indexOf(tier.floor);
      for (let i = 0; i < 300; i += 1) {
        const result = roll(tier, "client", `guarantee-${i}`);
        const best = Math.max(
          ...result.cards.map((c) => RANK.indexOf(c.rarity))
        );
        expect(best).toBeGreaterThanOrEqual(floorRank);
      }
    }
  });

  it("marks a card the guarantee moved, and marks nothing otherwise", () => {
    /* The floor must be auditable. A chest that quietly upgrades a slot and
       says nothing is indistinguishable from one that got lucky, and the
       Ceremony has to be able to tell a member which happened. */
    let sawGuaranteed = false;
    for (let i = 0; i < 300; i += 1) {
      const result = roll(knight, "client", `mark-${i}`);
      const marked = result.cards.filter((c) => c.guaranteed);
      expect(marked.length).toBeLessThanOrEqual(1);
      if (marked.length === 1) {
        sawGuaranteed = true;
        /* The floor fired, so nothing else in the chest reached it. */
        const floorRank = RANK.indexOf(knight.floor);
        const others = result.cards.slice(0, -1);
        expect(others.every((c) => RANK.indexOf(c.rarity) < floorRank)).toBe(true);
      }
    }
    /* The Knight's chest misses legendary on its own often enough that three
       hundred openings without a single upgrade would mean the floor is dead
       code rather than a guarantee. */
    expect(sawGuaranteed).toBe(true);
  });

  it("draws roughly the odds printed on the box", () => {
    /* Not a precise distribution test, which would be flaky by construction.
       This catches the failures that matter: a rarity that never appears, one
       that appears far too often, and an odds table read in the wrong order.
       Rare is measured on the first two cards only, because the guarantee
       deliberately replaces the last one. */
    const counts: Record<string, number> = {};
    const rounds = 4000;
    for (let i = 0; i < rounds; i += 1) {
      for (const card of roll(squire, "client", `odds-${i}`).cards.slice(0, 2)) {
        counts[card.rarity] = (counts[card.rarity] ?? 0) + 1;
      }
    }
    const drawn = rounds * 2;
    expect(counts.rare / drawn).toBeGreaterThan(0.68);
    expect(counts.rare / drawn).toBeLessThan(0.8);
    expect(counts.epic / drawn).toBeGreaterThan(0.15);
    expect(counts.epic / drawn).toBeLessThan(0.25);
    /* Legendary at 5.4% and mythic at 0.6% are rare, not absent. A table read
       one rung off would show zero of one of them across eight thousand
       draws. */
    expect(counts.legendary ?? 0).toBeGreaterThan(0);
    expect(counts.mythic ?? 0).toBeGreaterThan(0);
  });

  it("publishes a proof that matches the seed it rolled with", () => {
    const result = roll(squire, "my client seed", "nonce-1");
    expect(result.proof.server_seed_hash).toBe(seedHash(SERVER_SEED));
    expect(result.proof.client_seed).toBe("my client seed");
    expect(result.proof.nonce).toBe("nonce-1");
  });

  it("hashes a seed the way the commitment does", () => {
    /* sha256 of the empty string, as a fixed point on the whole scheme: if
       this ever changes, every commitment the realm has published is void. */
    expect(seedHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});
