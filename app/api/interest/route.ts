import { requireProfile, getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { isInterestFeature } from "@/lib/realm/interest";

/* The waitlist (V2 Part Two, section 27.3): "Notify me" buttons that actually
 * register something. Interest counts are real demand data for the launch
 * decision.
 *
 * This route ships before the collectibles migration is applied to the remote
 * database, so a missing interest table is an expected state, not a crash:
 * POST answers 503 with a clear body and GET answers an empty list, which is
 * also the true answer (nobody is registered in a table that does not exist).
 */

/* Postgres error codes the route understands by name. */
const UNDEFINED_TABLE = "42P01";
const UNIQUE_VIOLATION = "23505";

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. Signed-out
     callers get the honest empty list, same shape as /api/mutes. */
  const profile = await getProfile(req);
  if (!profile) return json({ features: [] });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db
    .from("interest")
    .select("feature")
    .eq("profile_id", profile.id);
  if (error) {
    /* Table not migrated yet: nobody is registered. Anything else is real. */
    if (error.code === UNDEFINED_TABLE) return json({ features: [] });
    return json({ error: "unavailable" }, 503);
  }
  return json({ features: (data ?? []).map((r) => r.feature as string) });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    feature?: unknown;
  } | null;
  /* Explicit allowlist, never freeform. See lib/realm/interest.ts. */
  if (!isInterestFeature(body?.feature)) {
    return json({ error: "unknown feature" }, 400);
  }

  const { error } = await db
    .from("interest")
    .insert({ profile_id: profile.id, feature: body.feature });

  if (error) {
    /* Already registered: that is success, not an error. Registering twice
       is one registration, and the button that retries must settle calm. */
    if (error.code === UNIQUE_VIOLATION) return json({ registered: true });
    if (error.code === UNDEFINED_TABLE) {
      return json(
        { error: "interest is not open yet: the table has not been migrated" },
        503
      );
    }
    return json({ error: "unavailable" }, 503);
  }
  return json({ registered: true });
}
