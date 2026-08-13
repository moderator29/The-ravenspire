import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* GET /api/chests/entitlements: how many unopened chests the member holds, by
 * sku.
 *
 * The question every buying surface has to ask before it renders anything: is
 * there a chest here waiting to be opened. Without it the Warchests page would
 * either show an open control to everybody, which is a dead door for the
 * ninety nine percent who own nothing, or show it to nobody, which is a dead
 * door for the person who just paid.
 *
 * Counts only, deliberately. The entitlement ids are the opening route's
 * business: it picks the oldest itself and locks it, so handing ids to a
 * client would only invite one to be named, and a client that can name an
 * entitlement is a client that can try to name somebody else's.
 *
 * Honest empty for everyone today: nothing grants an entitlement yet, because
 * checkout and redemption are the only two writers and both wait on the
 * confirmation gate.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. */
  const profile = await getProfile(req);
  if (!profile) return json({ unopened: {} });

  const db = adminClient();
  if (!db) return json({ unopened: {} });

  const { data, error } = await db
    .from("chest_entitlements")
    .select("chest_sku")
    .eq("profile_id", profile.id)
    .is("opened_at", null)
    .limit(500);

  if (error) {
    /* Not migrated yet: nobody holds anything, which is also true. */
    if (error.code === UNDEFINED_TABLE) return json({ unopened: {} });
    return json({ error: "unavailable" }, 503);
  }

  const unopened: Record<string, number> = {};
  for (const row of data ?? []) {
    const sku = (row as { chest_sku: string }).chest_sku;
    unopened[sku] = (unopened[sku] ?? 0) + 1;
  }

  return json({ unopened });
}
