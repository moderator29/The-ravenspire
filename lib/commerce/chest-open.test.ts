import { describe, it, expect } from "vitest";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { setOneCards } from "@/lib/collectibles/set-one";
import {
  openChest,
  hashSeed,
  generateServerSeed,
  cardCount,
  guaranteeFloor,
  type PackRarity,
} from "@/lib/commerce/chest-open";

const RANK: Record<PackRarity, number> = {
  rare: 0,
  epic: 1,
  legendary: 2,
  mythic: 3,
};

const DIGITAL = CHEST_TIERS.filter((t) => t.kind === "digital");
const realNumbers = new Set(setOneCards.map((c) => c.number));

describe("chest opening: provably fair", () => {
  it("is deterministic given the same inputs", () => {
    const tier = DIGITAL[0];
    const serverSeed = "a".repeat(64);
    const a = openChest({ tier, serverSeed, clientSeed: "player", nonce: 1 });
    const b = openChest({ tier, serverSeed, clientSeed: "player", nonce: 1 });
    expect(b.cards).toEqual(a.cards);
  });

  it("changes with the client seed and the nonce", () => {
    const tier = DIGITAL[0];
    const serverSeed = "b".repeat(64);
    const base = openChest({ tier, serverSeed, clientSeed: "x", nonce: 1 });
    const otherSeed = openChest({ tier, serverSeed, clientSeed: "y", nonce: 1 });
    const otherNonce = openChest({ tier, serverSeed, clientSeed: "x", nonce: 2 });
    /* Not a hard guarantee for a single draw, but across a full pull the odds
       of an identical multi-card result are negligible. */
    expect(otherSeed.cards).not.toEqual(base.cards);
    expect(otherNonce.cards).not.toEqual(base.cards);
  });

  it("commits to a hash the buyer can verify", () => {
    const serverSeed = generateServerSeed();
    const result = openChest({
      tier: DIGITAL[0],
      serverSeed,
      clientSeed: "verify",
      nonce: 0,
    });
    expect(result.serverSeedHash).toBe(hashSeed(serverSeed));
    expect(serverSeed).toHaveLength(64);
  });

  it("pulls exactly the printed card count", () => {
    for (const tier of DIGITAL) {
      const result = openChest({
        tier,
        serverSeed: "c".repeat(64),
        clientSeed: "n",
        nonce: 3,
      });
      expect(result.cards).toHaveLength(cardCount(tier));
    }
  });

  it("only ever pulls real Set One cards", () => {
    const tier = DIGITAL[0];
    for (let n = 0; n < 200; n++) {
      const result = openChest({
        tier,
        serverSeed: hashSeed(String(n)),
        clientSeed: "pool",
        nonce: n,
      });
      for (const card of result.cards) {
        expect(realNumbers.has(card.number)).toBe(true);
      }
    }
  });

  it("always honours the printed guarantee floor", () => {
    for (const tier of DIGITAL) {
      const floor = guaranteeFloor(tier);
      if (!floor) continue;
      for (let n = 0; n < 500; n++) {
        const result = openChest({
          tier,
          serverSeed: hashSeed(`g${n}`),
          clientSeed: "floor",
          nonce: n,
        });
        const best = Math.max(...result.cards.map((c) => RANK[c.rarity]));
        expect(best).toBeGreaterThanOrEqual(RANK[floor]);
      }
    }
  });

  it("draws rarities roughly in line with the printed odds", () => {
    /* A large sample should track the printed odds. The guarantee lifts a few
       low pulls, so higher rarities run slightly above their raw odds and rare
       slightly below; a wide tolerance keeps the test about gross correctness,
       not exact frequency. */
    const tier = DIGITAL[0];
    const counts: Record<string, number> = {};
    let total = 0;
    const draws = 4000;
    for (let n = 0; n < draws; n++) {
      const result = openChest({
        tier,
        serverSeed: hashSeed(`odds${n}`),
        clientSeed: "dist",
        nonce: n,
      });
      for (const c of result.cards) {
        counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
        total++;
      }
    }
    /* Rare is the bulk of the box; it should be the plurality by a wide margin. */
    const rarePct = (counts.rare ?? 0) / total;
    expect(rarePct).toBeGreaterThan(0.4);
    /* Every rarity that has non-zero odds should appear at least once. */
    for (const r of ["rare", "epic", "legendary"]) {
      expect(counts[r] ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("chest opening: parsers", () => {
  it("reads the guarantee floor from the printed text", () => {
    const squire = CHEST_TIERS.find((t) => t.sku === "squires-chest")!;
    const knight = CHEST_TIERS.find((t) => t.sku === "knights-warchest")!;
    expect(guaranteeFloor(squire)).toBe("epic");
    expect(guaranteeFloor(knight)).toBe("legendary");
  });

  it("reads the card count from the printed contents", () => {
    const squire = CHEST_TIERS.find((t) => t.sku === "squires-chest")!;
    const knight = CHEST_TIERS.find((t) => t.sku === "knights-warchest")!;
    expect(cardCount(squire)).toBe(3);
    expect(cardCount(knight)).toBe(5);
  });
});
