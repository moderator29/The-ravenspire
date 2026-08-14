import type { ChestTier } from "@/lib/collectibles/warchests";
import { setOneCards } from "@/lib/collectibles/set-one";
import type { Rarity } from "@/lib/game/champions";

/* Client-side provably-fair verifier (V2 Part Two, section 34).
 *
 * The opening reveal returns the server seed, the committed hash, the client
 * seed and the nonce. This module lets a member CONFIRM the pull in their own
 * browser, taking nothing on trust:
 *
 *   1. HASH CHECK. sha256(serverSeed) must equal the committed serverSeedHash
 *      the server published before the pull. If it matches, the server could
 *      not have chosen the seed after seeing the client seed.
 *   2. DRAW REPLAY. Re-run the exact deterministic draw from those inputs and
 *      confirm the cards match the ones the member was shown. If they match,
 *      the outcome is a pure function of the committed seed and cannot have been
 *      steered.
 *
 * This is a faithful mirror of the pure server algorithm in
 * lib/commerce/chest-open.ts, expressed against the Web Crypto API (SubtleCrypto
 * HMAC-SHA256 and SHA-256) so it runs with zero dependencies in the browser.
 * The two implementations MUST agree: the odds are the same single source
 * (the tier, validated to sum to 100), and the card pools are the same real
 * Set One roster. If chest-open.ts changes, change this in lockstep.
 */

export type PackRarity = Exclude<Rarity, "common">;

const RARITY_ORDER: PackRarity[] = ["rare", "epic", "legendary", "mythic"];

function rank(r: PackRarity): number {
  return RARITY_ORDER.indexOf(r);
}

export interface RevealedCard {
  number: number;
  slug: string;
  rarity: PackRarity;
}

export interface Proof {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface VerifyResult {
  /* sha256(serverSeed) matched the committed hash. */
  hashOk: boolean;
  /* The replayed draw reproduced exactly the revealed cards. */
  drawOk: boolean;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/* HMAC-SHA256(key = serverSeed, message), returning the raw bytes. Mirrors the
   Node createHmac("sha256", serverSeed) the server uses. */
async function hmac(serverSeed: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return new Uint8Array(sig);
}

/* A uniform float in [0, 1), the same derivation as the server: 7 bytes of the
   HMAC over `${clientSeed}:${nonce}:${label}`, divided by 2^56. */
async function uniform(
  proof: Proof,
  label: string
): Promise<number> {
  const mac = await hmac(
    proof.serverSeed,
    `${proof.clientSeed}:${proof.nonce}:${label}`
  );
  let value = 0;
  for (let i = 0; i < 7; i++) value = value * 256 + mac[i];
  return value / 2 ** 56;
}

function drawRarity(tier: ChestTier, u: number): PackRarity {
  const target = u * 100;
  let cumulative = 0;
  for (const r of RARITY_ORDER) {
    cumulative += tier.odds[r] ?? 0;
    if (target < cumulative) return r;
  }
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    if ((tier.odds[RARITY_ORDER[i]] ?? 0) > 0) return RARITY_ORDER[i];
  }
  return "rare";
}

function drawCard(rarity: PackRarity, u: number): RevealedCard {
  const pool = setOneCards.filter((c) => c.champion.rarity === rarity);
  const idx = Math.min(pool.length - 1, Math.floor(u * pool.length));
  const chosen = pool[idx];
  return { number: chosen.number, slug: chosen.champion.slug, rarity };
}

function cardCount(tier: ChestTier): number {
  for (const line of tier.contents) {
    const m = /(\d+)\s+(?:printed\s+)?cards?/i.exec(line);
    if (m) return Number(m[1]);
  }
  return 0;
}

function guaranteeFloor(tier: ChestTier): PackRarity | null {
  let floor: PackRarity | null = null;
  const text = tier.guarantee.toLowerCase();
  for (const r of RARITY_ORDER) {
    if (text.includes(r)) {
      if (floor === null || rank(r) > rank(floor)) floor = r;
    }
  }
  return floor;
}

/* Replay the draw purely from the proof, mirroring openChest exactly. */
async function replay(tier: ChestTier, proof: Proof): Promise<RevealedCard[]> {
  const count = cardCount(tier);
  const cards: RevealedCard[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = drawRarity(tier, await uniform(proof, `rarity:${i}`));
    cards.push(drawCard(rarity, await uniform(proof, `card:${i}`)));
  }
  const floor = guaranteeFloor(tier);
  if (floor && !cards.some((c) => rank(c.rarity) >= rank(floor))) {
    let worst = 0;
    for (let i = 1; i < cards.length; i++) {
      if (rank(cards[i].rarity) < rank(cards[worst].rarity)) worst = i;
    }
    cards[worst] = drawCard(floor, await uniform(proof, `guarantee`));
  }
  return cards;
}

/* Verify a revealed pull. Both checks must pass for a member to trust the box:
   the seed matches its commitment, and the draw reproduces the shown cards. */
export async function verifyOpening(
  tier: ChestTier,
  proof: Proof,
  revealed: RevealedCard[]
): Promise<VerifyResult> {
  const hashOk = (await sha256Hex(proof.serverSeed)) === proof.serverSeedHash;

  let drawOk = false;
  try {
    const replayed = await replay(tier, proof);
    drawOk =
      replayed.length === revealed.length &&
      replayed.every(
        (c, i) =>
          c.number === revealed[i].number &&
          c.slug === revealed[i].slug &&
          c.rarity === revealed[i].rarity
      );
  } catch {
    drawOk = false;
  }

  return { hashOk, drawOk };
}
