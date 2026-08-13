import { describe, it, expect } from "vitest";
import { verifyDraw, isDrawReference } from "@/lib/collectibles/verify";
import { rollChest, seedHash, type PulledCard } from "@/lib/collectibles/roll";
import { CHEST_TIERS, type ChestTier } from "@/lib/collectibles/warchests";

/* The verifier has to be able to say no.
 *
 * A verifier that says yes to a correct triple is worth nothing on its own,
 * because that is the case nobody was worried about. What decides whether this
 * feature is honest is whether it says NO, loudly, to a triple that does not
 * reproduce the record: a swapped seed, a swapped nonce, a swapped client seed,
 * a single card altered in the recorded result. Every one of those is a way a
 * house could try to pass off a draw it did not make, and every one of them is
 * asserted below.
 *
 * The recorded openings here are produced by `rollChest` itself, which is the
 * only honest way to build them. There are no real openings in the realm and
 * there will not be until chests go live, and inventing a plausible looking
 * recorded chest and asserting the verifier agrees with it would be testing a
 * fixture rather than the function. Rolling the record and then corrupting the
 * inputs tests the thing that actually matters: that the comparison is
 * sensitive to each of the three inputs independently.
 */

const tiers = new Map(CHEST_TIERS.map((t) => [t.sku, t] as const));
const knight = tiers.get("knights-warchest") as ChestTier;

const SERVER_SEED =
  "3f5b1c9d2e8a47160b93c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70819";
const CLIENT_SEED = "for the realm";
const NONCE = "8e2f4c1a-91b7-4a30-9c55-2d6e0f7b3a41";

/* An opening exactly as `public.chest_open` would have recorded it: the cards
   the roll produced, in the order it produced them, beside the hash that was
   published before it. */
function recordedOpening(tier: ChestTier = knight) {
  const roll = rollChest({
    tier,
    serverSeed: SERVER_SEED,
    clientSeed: CLIENT_SEED,
    nonce: NONCE,
  });
  return {
    chestSku: tier.sku,
    committedHash: seedHash(SERVER_SEED),
    recordedCards: roll.cards,
  };
}

const truth = {
  serverSeed: SERVER_SEED,
  clientSeed: CLIENT_SEED,
  nonce: NONCE,
};

function check(v: ReturnType<typeof verifyDraw>, id: "commitment" | "cards") {
  return v.checks.find((c) => c.id === id);
}

describe("verifyDraw, the correct triple", () => {
  it("reproduces the recorded cards exactly and calls it a match", () => {
    const record = recordedOpening();
    const v = verifyDraw({ ...record, ...truth });

    expect(v.verdict).toBe("match");
    expect(check(v, "commitment")?.state).toBe("pass");
    expect(check(v, "cards")?.state).toBe("pass");
    expect(v.cards).toEqual(record.recordedCards);
    expect(v.computedHash).toBe(record.committedHash);
  });

  it("matches for every tier the realm sells", () => {
    for (const tier of CHEST_TIERS) {
      const record = recordedOpening(tier);
      const v = verifyDraw({ ...record, ...truth });
      expect(v.verdict).toBe("match");
      expect(v.cards).toHaveLength(tier.cardCount);
    }
  });

  it("tolerates the guarantee flag arriving as false rather than absent", () => {
    /* The roll omits `guaranteed` on an ordinary card. A JSON round trip
       through Postgres and back may hand it over as an explicit false. If the
       comparison were literal, every honest opening would be reported as
       forged, which is the exact false accusation this module exists to avoid
       and is invisible until real openings exist. */
    const record = recordedOpening();
    const asStored: PulledCard[] = record.recordedCards.map((c) => ({
      ...c,
      guaranteed: c.guaranteed === true,
    }));
    const v = verifyDraw({ ...record, recordedCards: asStored, ...truth });
    expect(v.verdict).toBe("match");
  });
});

describe("verifyDraw, the triples that must fail", () => {
  it("fails on a mismatched server seed, on both counts", () => {
    const record = recordedOpening();
    const wrong = SERVER_SEED.replace(/^3/, "4");
    const v = verifyDraw({ ...record, ...truth, serverSeed: wrong });

    expect(v.verdict).toBe("mismatch");
    /* Both checks fail, and they fail for different reasons. The commitment
       says this seed is not the one the realm promised; the cards say it did
       not deal what the record holds. */
    expect(check(v, "commitment")?.state).toBe("fail");
    expect(check(v, "cards")?.state).toBe("fail");
  });

  it("fails on a mismatched nonce, while the commitment still passes", () => {
    /* The most instructive failure on the page. The seed IS the committed one,
       so the realm kept its promise about the seed, and the draw still does not
       reproduce the record: this is a different opening. A verifier that only
       checked the hash would call this a pass, which is why the card check
       exists at all. */
    const record = recordedOpening();
    const v = verifyDraw({
      ...record,
      ...truth,
      nonce: "8e2f4c1a-91b7-4a30-9c55-2d6e0f7b3a42",
    });

    expect(v.verdict).toBe("mismatch");
    expect(check(v, "commitment")?.state).toBe("pass");
    expect(check(v, "cards")?.state).toBe("fail");
  });

  it("fails on a mismatched client seed", () => {
    const record = recordedOpening();
    const v = verifyDraw({ ...record, ...truth, clientSeed: "for the realm " });

    expect(v.verdict).toBe("mismatch");
    expect(check(v, "commitment")?.state).toBe("pass");
    expect(check(v, "cards")?.state).toBe("fail");
  });

  it("fails on a mismatched committed hash", () => {
    const record = recordedOpening();
    const v = verifyDraw({
      ...record,
      ...truth,
      committedHash: seedHash("some other seed entirely"),
    });

    expect(v.verdict).toBe("mismatch");
    expect(check(v, "commitment")?.state).toBe("fail");
    /* The cards still reproduce, which is the honest reading: the draw is real,
       the commitment behind it is not the one shown. */
    expect(check(v, "cards")?.state).toBe("pass");
  });

  it("fails when one recorded card was altered, and names the slot", () => {
    const record = recordedOpening();
    const tampered = record.recordedCards.map((c, i) =>
      i === 2 ? { ...c, card_number: c.card_number + 1 } : c
    );
    const v = verifyDraw({ ...record, recordedCards: tampered, ...truth });

    expect(v.verdict).toBe("mismatch");
    expect(check(v, "cards")?.detail).toContain("Card 3");
  });

  it("fails when the record holds a different number of cards", () => {
    const record = recordedOpening();
    const v = verifyDraw({
      ...record,
      recordedCards: record.recordedCards.slice(0, 3),
      ...truth,
    });

    expect(v.verdict).toBe("mismatch");
    expect(check(v, "cards")?.detail).toContain("3");
  });

  it("fails when the recorded cards are the same set in another order", () => {
    /* Order is part of the claim. The guarantee always lands in the last slot,
       so a reordered record is not a chest this triple dealt. */
    const record = recordedOpening();
    const shuffled = [...record.recordedCards];
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    /* Only meaningful when the first two actually differ. */
    if (shuffled[0].champion_slug !== record.recordedCards[0].champion_slug) {
      const v = verifyDraw({ ...record, recordedCards: shuffled, ...truth });
      expect(v.verdict).toBe("mismatch");
    }
  });
});

describe("verifyDraw, what it refuses to call a match", () => {
  it("returns recomputed, never match, when there is nothing to compare", () => {
    /* The manual form. The member supplied all three inputs themselves, so the
       function has been shown to be deterministic and NOTHING has been shown
       about any chest anybody opened. Calling that a match would be the page
       lying on the realm's behalf. */
    const v = verifyDraw({ chestSku: knight.sku, ...truth });

    expect(v.verdict).toBe("recomputed");
    expect(v.cards).toHaveLength(knight.cardCount);
    expect(check(v, "commitment")?.state).toBe("absent");
    expect(check(v, "cards")?.state).toBe("absent");
  });

  it("is deterministic, so the same inputs twice give the same cards", () => {
    const a = verifyDraw({ chestSku: knight.sku, ...truth });
    const b = verifyDraw({ chestSku: knight.sku, ...truth });
    expect(b.cards).toEqual(a.cards);
  });

  it("is unusable, not a mismatch, when the chest is unknown", () => {
    /* An unknown chest is the member's input being incomplete, not the realm
       failing a proof. Reporting it as a mismatch would accuse the house of
       something on the strength of a typo. */
    const v = verifyDraw({ chestSku: "no-such-chest", ...truth });
    expect(v.verdict).toBe("unusable");
    expect(v.cards).toBeNull();
    expect(v.problem).toBeTruthy();
  });

  it("is unusable when the server seed or the draw reference is missing", () => {
    expect(
      verifyDraw({ chestSku: knight.sku, ...truth, serverSeed: "" }).verdict
    ).toBe("unusable");
    expect(
      verifyDraw({ chestSku: knight.sku, ...truth, nonce: "" }).verdict
    ).toBe("unusable");
  });

  it("accepts an empty client seed, which is a real choice", () => {
    /* Empty means the member expressed no preference. The server seed still
       carries the randomness, and `cleanClientSeed` stores it as an empty
       string, so the verifier must be able to rerun one. */
    const v = verifyDraw({ chestSku: knight.sku, ...truth, clientSeed: "" });
    expect(v.verdict).toBe("recomputed");
    expect(v.cards).toHaveLength(knight.cardCount);
  });
});

describe("isDrawReference", () => {
  it("accepts a uuid and rejects everything else", () => {
    expect(isDrawReference(NONCE)).toBe(true);
    expect(isDrawReference(` ${NONCE.toUpperCase()} `)).toBe(true);
    expect(isDrawReference("")).toBe(false);
    expect(isDrawReference("not-a-uuid")).toBe(false);
    /* The reason this exists: an id like this reaching Postgres raises 22P02,
       and a raw database error rendered at a member is useless to them and
       tells an attacker the shape of the query. */
    expect(isDrawReference("1' or '1'='1")).toBe(false);
  });
});
