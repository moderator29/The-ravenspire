import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* GET /api/commerce/orders (V2 Part Two, section 33, Phase D).
 *
 * A member's own order history, for the Vault. Ownership is enforced here in
 * the route under the service role, filtered to the caller's profile id, the
 * standard posture for this Privy-authenticated stack (auth.uid() is null, so
 * RLS is deny-by-default and the route is the guard).
 *
 * Read-only auth: a signed-out caller gets an honest empty list, never a
 * minted profile. Amounts are integer minor units; the client formats them.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

export async function GET(req: Request) {
  const profile = await getProfile(req);
  if (!profile) return json({ orders: [] });

  const db = adminClient();
  if (!db) return json({ orders: [] });

  const res = await db
    .from("orders")
    .select("id, status, total_minor, currency, created_at, paid_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (res.error) {
    if (res.error.code === UNDEFINED_TABLE) return json({ orders: [] });
    return json({ error: "unavailable" }, 503);
  }

  return json({ orders: res.data ?? [] });
}
