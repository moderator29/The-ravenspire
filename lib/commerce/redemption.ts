import { createHash, randomInt } from "node:crypto";

/* Redemption codes (V2 Part Two, section 34): the physical-to-digital bridge.
 *
 * A King's Reliquary ships with one printed, single-use code. Redeeming it
 * mints the digital twins of the printed cards to the buyer's OWN wallet
 * through a non-custodial voucher: the platform signs a claim the member
 * executes, it never holds the asset or the keys (rule 5).
 *
 * The code is a bearer secret printed on paper, so it is treated like a
 * password: stored only as a hash, never in the clear, and compared by hashing
 * the presented code and matching the digest. A database leak reveals no usable
 * code. Single use and replay resistance are enforced at the database: the
 * code_hash column is unique, and the claim is a conditional update that fires
 * only while the row is unredeemed, so two concurrent redemptions of the same
 * code cannot both win.
 *
 * This module is the pure part: generating a code, normalising a presented one,
 * and hashing. It holds no state and never touches the database. The route owns
 * the atomic claim.
 */

/* The alphabet a printed code is drawn from. No zero, O, one, I or L: a code is
   read off paper and typed by a human, and those are the pairs people confuse.
   Uppercase only, so case never has to matter. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/* Codes are grouped for legibility: RSPX-4K7Q-9WTM. The group size and count
   set the space. Five groups of four from a 30-symbol alphabet is about 98
   bits, far beyond guessable, so a valid code cannot be found by trying. */
const GROUP_SIZE = 4;
const GROUP_COUNT = 5;

/* Generate a fresh, human-typable code in the clear. This value is printed and
   then discarded server-side: only its hash is stored. randomInt is the CSPRNG,
   because a guessable code is a free chest. */
export function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = "";
    for (let i = 0; i < GROUP_SIZE; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/* Reduce a presented code to its canonical form before hashing: uppercase,
   and every character that is not in the alphabet removed, so dashes, spaces
   and stray punctuation a person adds do not change the digest. A code and the
   same code typed with lower case and no dashes hash to the same value. */
export function normalizeCode(raw: string): string {
  const upper = raw.toUpperCase();
  let out = "";
  for (const ch of upper) if (ALPHABET.includes(ch)) out += ch;
  return out;
}

/* The stored digest of a code. sha256 of the normalised code: a code is high
   entropy already, so it needs no salt, and an unsalted digest is what lets the
   route look a code up by its hash. */
export function hashCode(raw: string): string {
  return createHash("sha256").update(normalizeCode(raw)).digest("hex");
}

/* A presented code is well formed when it normalises to exactly the expected
   number of symbols. A cheap shape check before the database lookup, so
   obvious typos fail fast without a query. */
export function isWellFormed(raw: string): boolean {
  return normalizeCode(raw).length === GROUP_SIZE * GROUP_COUNT;
}
