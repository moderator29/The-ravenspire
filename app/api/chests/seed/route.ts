import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import {
  activeCommitment,
  cleanClientSeed,
  publicCommitment,
  rotateCommitment,
} from "@/lib/collectibles/seeds";

/* The seed commitment.
 *
 * GET  /api/chests/seed   the live commitment's hash, plus every retired one
 *                         with its seed published
 * POST /api/chests/seed   retire the live commitment, publishing its seed,
 *                         and commit a fresh one with a new client seed
 *
 * This route is what makes the chests provably fair rather than merely
 * verifiable after the fact. The GET creates the member's commitment the first
 * time they ask, which is before they can possibly have opened anything, so
 * the hash is in their hands before the realm knows what they will open. A
 * seed published only at open time would prove nothing at all.
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
  } | null;

  const rotated = await rotateCommitment(
    db,
    profile.id,
    cleanClientSeed(body?.client_seed)
  );
  if (!rotated) return json({ error: "unavailable" }, 503);

  return json(rotated);
}
