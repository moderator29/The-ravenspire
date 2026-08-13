import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import {
  activeCommitment,
  cleanClientSeed,
  publicCommitment,
  rotateCommitment,
  setClientSeed,
} from "@/lib/collectibles/seeds";

/* The seed commitment.
 *
 * GET  /api/chests/seed   the live commitment's hash, plus every retired one
 *                         with its seed published
 * POST /api/chests/seed   set your client seed on the live commitment, having
 *                         seen its hash. Pass rotate:true to also retire the
 *                         commitment, publishing its seed, and take a new one.
 *
 * This route is step one and step two of the scheme. The GET creates the
 * member's commitment the first time they ask, which is before they can
 * possibly have opened anything, so the hash is in their hands before the realm
 * knows what they will open. The POST is where they answer it with a client
 * seed of their own, having already seen the hash. Neither side can pick to
 * suit the other, which is the whole guarantee.
 *
 * Step three is the opening itself, which reveals the seed and commits the next
 * one in the same transaction. A member never has to come back here to be able
 * to check a chest.
 *
 * Deliberately NOT flag gated. A member is entitled to hold the realm to its
 * promise before the chests are live and long after they are, and the honesty
 * of the scheme rests on the commitment existing early. Nothing here opens
 * anything or costs anything.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

/* Rotating is cheap but it is a write, and a loop rotating a thousand times
   would bury the real history the verifier reads. */
const ROTATE_LIMIT = 30;
const ROTATE_WINDOW_SECONDS = 3600;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  try {
    const current = await activeCommitment(db, profile.id);
    if (!current) return json({ error: "unavailable" }, 503);

    /* The retired commitments, seeds published. This is the audit trail: with
       one of these seeds, its client seed, and the entitlement id of an
       opening, anyone can rerun the roll and get the same cards. */
    const { data: history } = await db
      .from("chest_seeds")
      .select("id, seed, seed_hash, client_seed, created_at, revealed_at")
      .eq("profile_id", profile.id)
      .eq("active", false)
      .order("created_at", { ascending: false })
      .limit(50);

    return json({
      /* The live one, hash only. Publishing the seed now would let the member
         predict every chest still to come under it. */
      commitment: publicCommitment(current),
      revealed: history ?? [],
    });
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return json({ error: "The chests are not ready yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const rl = await rateLimit(
    profileKey("chest-seed", profile.id),
    ROTATE_LIMIT,
    ROTATE_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const body = (await req.json().catch(() => null)) as {
    client_seed?: unknown;
    rotate?: unknown;
  } | null;

  const clientSeed = cleanClientSeed(body?.client_seed);

  /* Rotating is the member's own choice, not a side effect of naming a seed.
     Setting a client seed under the live commitment is the ordinary step two;
     rotating is for the member who wants the realm to commit again before they
     open anything, which is the standard courtesy of the scheme and the way
     somebody who suspects the house forces its hand. */
  if (body?.rotate === true) {
    const rotated = await rotateCommitment(db, profile.id, clientSeed);
    if (!rotated) return json({ error: "unavailable" }, 503);
    return json(rotated);
  }

  /* Make sure a commitment exists before writing to it: a member who names a
     client seed on their very first visit should not be told no. */
  const current = await activeCommitment(db, profile.id);
  if (!current) return json({ error: "unavailable" }, 503);

  const updated = await setClientSeed(db, profile.id, clientSeed);
  if (!updated) return json({ error: "unavailable" }, 503);
  return json({ commitment: updated });
}
