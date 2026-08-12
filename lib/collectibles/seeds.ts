import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedHash } from "@/lib/collectibles/pulls";

/* The commitment: the half of "provably fair" that is usually skipped.
 *
 * A server seed is only a promise if it exists before the member can act on
 * it. Generated at open time it proves nothing, because a server that picks
 * after the fact can pick again. So a member's seed is created the first time
 * they look at the chests, its hash is handed to them immediately, and it does
 * not change until they retire it. Retiring publishes the seed, which is what
 * makes every opening under it checkable after the fact.
 *
 * The live seed is a secret and this module is the only thing that reads it.
 * It never appears in a response, never in a log, never in an error. The
 * routes above deal in hashes and in revealed seeds only.
 */

export type Commitment = {
  id: string;
  seed_hash: string;
  client_seed: string;
  created_at: string;
};

export type RevealedCommitment = Commitment & {
  seed: string;
  revealed_at: string;
};

type SeedRow = {
  id: string;
  seed: string;
  seed_hash: string;
  client_seed: string;
  created_at: string;
};

/* The member's live commitment, created on first sight if they have none.
   Idempotent under a race: the partial unique index allows exactly one active
   row per member, so a second concurrent creation loses and reads back the
   winner rather than leaving the member with two seeds and no way to know
   which one rolled their chest. */
export async function activeCommitment(
  db: SupabaseClient,
  profileId: string
): Promise<SeedRow | null> {
  const existing = await readActive(db, profileId);
  if (existing) return existing;

  const seed = randomBytes(32).toString("hex");
  const { data, error } = await db
    .from("chest_seeds")
    .insert({ profile_id: profileId, seed, seed_hash: seedHash(seed) })
    .select("id, seed, seed_hash, client_seed, created_at")
    .single();

  if (error) {
    /* Unique violation means somebody else's request created it a moment ago,
       which is success from here. Anything else is a real failure and the
       caller must not proceed: rolling a chest without a committed seed is
       exactly the thing this module exists to prevent. */
    return await readActive(db, profileId);
  }
  return data as SeedRow;
}

async function readActive(
  db: SupabaseClient,
  profileId: string
): Promise<SeedRow | null> {
  const { data } = await db
    .from("chest_seeds")
    .select("id, seed, seed_hash, client_seed, created_at")
    .eq("profile_id", profileId)
    .eq("active", true)
    .maybeSingle();
  return (data as SeedRow) ?? null;
}

/* What the member is allowed to see about their live commitment: the hash and
   their own client seed. Never the seed. */
export function publicCommitment(row: SeedRow): Commitment {
  return {
    id: row.id,
    seed_hash: row.seed_hash,
    client_seed: row.client_seed,
    created_at: row.created_at,
  };
}

/* Retire the live commitment, publishing its seed, and commit a fresh one.
 *
 * This is the only way a client seed changes, and that is deliberate. A client
 * seed edited under a live commitment would let a member re-roll a chest they
 * had already seen the odds of, because both halves of the input would then be
 * theirs to move. Rotating costs them nothing and keeps the scheme honest.
 *
 * Returns the revealed old commitment and the new one. A member who rotates
 * can now verify every chest they opened under the old seed. */
export async function rotateCommitment(
  db: SupabaseClient,
  profileId: string,
  clientSeed: string
): Promise<{ revealed: RevealedCommitment | null; next: Commitment } | null> {
  const current = await readActive(db, profileId);

  let revealed: RevealedCommitment | null = null;
  if (current) {
    const { data } = await db
      .from("chest_seeds")
      .update({ active: false, revealed_at: new Date().toISOString() })
      .eq("id", current.id)
      /* Guarded on active so two concurrent rotations cannot both claim to
         have retired the same commitment. */
      .eq("active", true)
      .select("id, seed, seed_hash, client_seed, created_at, revealed_at")
      .maybeSingle();
    if (data) {
      const row = data as SeedRow & { revealed_at: string };
      revealed = {
        id: row.id,
        seed: row.seed,
        seed_hash: row.seed_hash,
        client_seed: row.client_seed,
        created_at: row.created_at,
        revealed_at: row.revealed_at,
      };
    }
  }

  const seed = randomBytes(32).toString("hex");
  const { data: created, error } = await db
    .from("chest_seeds")
    .insert({
      profile_id: profileId,
      seed,
      seed_hash: seedHash(seed),
      client_seed: clientSeed,
    })
    .select("id, seed, seed_hash, client_seed, created_at")
    .single();

  if (error || !created) {
    /* The old commitment is retired and the new one did not land. Read back
       whatever is active now rather than leaving the member seedless: a
       concurrent rotation may have created it. */
    const fallback = await readActive(db, profileId);
    if (!fallback) return null;
    return { revealed, next: publicCommitment(fallback) };
  }

  return { revealed, next: publicCommitment(created as SeedRow) };
}

/* A client seed is the member's own text, and it goes into an HMAC, so the
   only rules are that it exists and that it is bounded. Empty is allowed and
   means "no preference", which is honest: the server seed still carries the
   randomness. */
export function cleanClientSeed(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 64);
}
