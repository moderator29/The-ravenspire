import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedHash } from "@/lib/collectibles/pulls";

/* The commitment, and the reveal: both halves of provably fair.
 *
 * A server seed is only a promise if it exists before the member can act on
 * it. Generated at open time it proves nothing, because a server that picks
 * after the fact can pick again. So a member's seed is created the first time
 * they look at the chests and its hash is handed to them immediately.
 *
 * And a proof nobody can run is a promise, not a proof. So an opening consumes
 * its commitment: the seed is revealed and retired and a fresh one is committed
 * in the same transaction (public.chest_open). A member walks away from every
 * chest holding everything needed to rerun the roll, without having to know
 * that a rotation feature exists.
 *
 * The order of the two steps is the whole point. The realm publishes the hash
 * before the member chooses their client seed, so it cannot pick a seed to suit
 * their choice; the member chooses after, so the realm cannot know their choice
 * in advance. Both halves are locked in before either side sees the other's.
 *
 * The live seed is a secret and this module is the only thing that reads it.
 * It never appears in a response, never in a log, never in an error, until the
 * opening that spends it publishes it.
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

/* Retire the live commitment by hand, publishing its seed, and commit a fresh
 * one. An opening does this for itself, so this exists for the member who wants
 * a new seed without opening anything: the standard courtesy of the scheme, and
 * the way a member who suspects the realm can force it to commit again.
 *
 * Returns the revealed old commitment and the new one. */
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

/* Set the client seed on the live commitment, without touching the seed behind
   it. This is step two of the scheme and it is safe precisely because step one
   already happened: the member has seen the hash, and changing their own half
   only re-randomises a function whose key they still do not know.

   An earlier version of this module refused to allow it, on the reasoning that
   a client seed changed under a live commitment would let a member re-roll a
   chest they had already seen. That was wrong. A roll cannot be seen without
   consuming an entitlement, and the entitlement is consumed in the same
   transaction that reveals the seed, so there is no "already seen" to exploit. */
export async function setClientSeed(
  db: SupabaseClient,
  profileId: string,
  clientSeed: string
): Promise<Commitment | null> {
  const { data } = await db
    .from("chest_seeds")
    .update({ client_seed: clientSeed })
    .eq("profile_id", profileId)
    .eq("active", true)
    .select("id, seed, seed_hash, client_seed, created_at")
    .maybeSingle();
  return data ? publicCommitment(data as SeedRow) : null;
}

/* A fresh secret and its commitment, for the seed that will be live after the
   next opening spends this one. Generated in the route so that the reveal and
   the recommit reach the database as one statement pair. */
export function nextCommitment(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString("hex");
  return { seed, seedHash: seedHash(seed) };
}

/* A client seed is the member's own text, and it goes into an HMAC, so the
   only rules are that it exists and that it is bounded. Empty is allowed and
   means "no preference", which is honest: the server seed still carries the
   randomness. */
export function cleanClientSeed(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 64);
}
