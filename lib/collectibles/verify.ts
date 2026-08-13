import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { rollChest, seedHash, type PulledCard } from "@/lib/collectibles/roll";

/* The verifier's judgement. This is the part of mission 6 worth testing hard.
 *
 * WHAT THIS MODULE IS FOR, AND WHY IT IS NOT IN THE COMPONENT.
 *
 * Rerunning the roll is the easy half: `rollChest` already does it and is
 * already tested. The half that decides whether the feature is worth anything
 * is the comparison, because a verifier that is generous about what counts as a
 * match is worse than no verifier at all. It would hand the realm a badge of
 * honesty it had not earned, and it would do so in the exact case that matters,
 * which is the case where somebody is checking because they suspect something.
 *
 * So the comparison lives here, as a pure function with no React and no fetch
 * in it, and `verify.test.ts` feeds it deliberately corrupted triples: a
 * changed seed, a changed nonce, a changed client seed, a recorded card altered
 * by one number. Every one of those must come back a mismatch. A test that only
 * ever checks the happy path proves the verifier can say yes, which nobody
 * doubted.
 *
 * IT RUNS IN THE BROWSER. That is the whole design. The realm's server is not
 * asked whether the numbers agree; it is asked only for the record it already
 * published, and this code, on the member's own machine, decides. See
 * `roll.ts` for why the algorithm ships to the client at all.
 *
 * FOUR VERDICTS, NOT TWO, and the third one is the honest one.
 *
 *   unusable    Nothing could be computed. An unknown chest, or a triple with
 *               a hole in it. Never dressed up as a failure of the realm.
 *   recomputed  The draw ran, but there is no recorded opening to hold it
 *               against. This is what the manual form returns, and it is
 *               deliberately NOT `match`: the member has proved the function
 *               is deterministic, which is a real thing to prove, and has
 *               proved nothing about any chest anybody opened.
 *   match       Every check that could be run, ran and passed.
 *   mismatch    At least one check failed. Said loudly, always.
 */

export type CheckState = "pass" | "fail" | "absent";

export type Check = {
  id: "commitment" | "cards";
  label: string;
  state: CheckState;
  /* One sentence a member can read without knowing what a hash is. */
  detail: string;
};

export type Verdict = "match" | "mismatch" | "recomputed" | "unusable";

export type VerifyInput = {
  chestSku: string;
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  /* The hash the realm published BEFORE the draw. Optional, because the manual
     form has no record behind it, and because a member checking from a
     screenshot may have the seed and not the hash. When present it is the
     strongest single check on this page: it is the only one that speaks to
     whether the realm committed early. */
  committedHash?: string | null;
  /* What the realm says it dealt. Optional for the same reason. */
  recordedCards?: PulledCard[] | null;
};

export type Verification = {
  verdict: Verdict;
  /* What the algorithm produced from the three inputs, in the order it
     produced them. Null only when nothing could be computed. */
  cards: PulledCard[] | null;
  /* sha256 of the server seed the member supplied, computed here. */
  computedHash: string | null;
  checks: Check[];
  /* Set only for `unusable`, and it names what is missing rather than saying
     the input was invalid, which tells a member nothing. */
  problem: string | null;
};

/* Two cards are the same card when the four fields the realm records are the
   same, plus the guarantee flag.
 *
 * `guaranteed` is normalised rather than compared as written, because the roll
 * omits the key entirely on an ordinary card and a JSON round trip through
 * Postgres may return it as absent, null or false. Comparing those as written
 * would report a mismatch on a chest that was dealt exactly as recorded, which
 * is the false accusation this whole module exists to avoid. */
function sameCard(a: PulledCard, b: PulledCard): boolean {
  return (
    a.set_slug === b.set_slug &&
    a.card_number === b.card_number &&
    a.champion_slug === b.champion_slug &&
    a.rarity === b.rarity &&
    (a.guaranteed === true) === (b.guaranteed === true)
  );
}

/* Order is part of the claim, not a presentation detail. The roll deals slot
   zero first and puts the guarantee in the last slot, so a recorded opening
   whose cards are the same multiset in a different order was not produced by
   this triple. The Ceremony sorts for the reveal; it sorts a copy, and the
   stored `result.cards` is the order the roll produced. */
function firstDifference(
  computed: PulledCard[],
  recorded: PulledCard[]
): number {
  const shared = Math.min(computed.length, recorded.length);
  for (let i = 0; i < shared; i += 1) {
    if (!sameCard(computed[i], recorded[i])) return i;
  }
  return computed.length === recorded.length ? -1 : shared;
}

export function verifyDraw(input: VerifyInput): Verification {
  const tier = CHEST_TIERS.find((t) => t.sku === input.chestSku);

  const unusable = (problem: string): Verification => ({
    verdict: "unusable",
    cards: null,
    computedHash: null,
    checks: [],
    problem,
  });

  if (!tier) {
    return unusable(
      "Name the chest this draw came from. A roll cannot be rerun without the odds and the card count it was rolled against."
    );
  }
  /* A server seed is the one input with no honest empty value. The client seed
     may legitimately be empty, which means the member expressed no preference,
     and the nonce is required because it is what makes one opening distinct
     from another. */
  if (!input.serverSeed) {
    return unusable("Paste the revealed server seed. Without it there is nothing to rerun.");
  }
  if (!input.nonce) {
    return unusable(
      "Paste the draw reference. It is the entitlement the chest was opened against, and it is what stops one seed dealing the same chest twice."
    );
  }

  const roll = rollChest({
    tier,
    serverSeed: input.serverSeed,
    clientSeed: input.clientSeed,
    nonce: input.nonce,
  });
  const computedHash = seedHash(input.serverSeed);

  const checks: Check[] = [];

  /* Check one: did the realm commit to this seed before the draw?
     This is the check a cheating house fails. Everything else here only proves
     the arithmetic; this proves the arithmetic was fixed in advance. */
  if (input.committedHash) {
    const committed = input.committedHash.trim().toLowerCase();
    const pass = committed === computedHash;
    checks.push({
      id: "commitment",
      label: "The seed is the one the realm committed to",
      state: pass ? "pass" : "fail",
      detail: pass
        ? "The published hash is the hash of this seed, so the realm was holding this seed before the chest was opened."
        : "The published hash is not the hash of this seed. Either the seed is not the one that drew this chest, or the realm changed it after committing.",
    });
  } else {
    checks.push({
      id: "commitment",
      label: "The seed is the one the realm committed to",
      state: "absent",
      detail:
        "No published hash was given, so nothing here says when the realm chose this seed.",
    });
  }

  /* Check two: does the rerun deal what the realm recorded? */
  const recorded = input.recordedCards ?? null;
  if (recorded) {
    const at = firstDifference(roll.cards, recorded);
    if (at === -1) {
      checks.push({
        id: "cards",
        label: "The rerun deals the cards on the record",
        state: "pass",
        detail: `All ${roll.cards.length} cards match, in the order they were dealt.`,
      });
    } else if (roll.cards.length !== recorded.length) {
      checks.push({
        id: "cards",
        label: "The rerun deals the cards on the record",
        state: "fail",
        detail: `The rerun deals ${roll.cards.length} cards and the record holds ${recorded.length}.`,
      });
    } else {
      checks.push({
        id: "cards",
        label: "The rerun deals the cards on the record",
        state: "fail",
        detail: `Card ${at + 1} differs. The rerun deals ${roll.cards[at].champion_slug}, the record says ${recorded[at].champion_slug}.`,
      });
    }
  } else {
    checks.push({
      id: "cards",
      label: "The rerun deals the cards on the record",
      state: "absent",
      detail:
        "No recorded opening was given, so there is nothing to hold this rerun against.",
    });
  }

  const failed = checks.some((c) => c.state === "fail");
  const anyCompared = checks.some((c) => c.state === "pass");

  return {
    verdict: failed ? "mismatch" : anyCompared ? "match" : "recomputed",
    cards: roll.cards,
    computedHash,
    checks,
    problem: null,
  };
}

/* What the public opening endpoint hands back, narrowed to what the verifier
   needs. Declared here rather than in the route so the browser and the route
   cannot drift apart on the shape. */
export type PublicOpening = {
  id: string;
  chest_sku: string;
  opened_at: string;
  cards: PulledCard[];
  proof: {
    server_seed_hash: string;
    server_seed: string;
    client_seed: string;
    nonce: string;
  };
};

/* Openings are addressed by uuid and nothing else. Checked before the id
   reaches Postgres, because a malformed uuid raises 22P02 there and a database
   error rendered at a member is both useless and a small information leak. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDrawReference(value: string): boolean {
  return UUID.test(value.trim());
}
