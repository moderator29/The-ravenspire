import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* GET /api/commerce/orders/[id] (V2 Part Two, section 33, Phase D).
 *
 * The status of one order, with its line items, for the Vault detail and the
 * post-checkout return page. Ownership is enforced by filtering on the caller's
 * profile id: an order that is not the caller's answers 404, never leaking that
 * it exists. A signed-out caller gets 401.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const { id } = await ctx.params;
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const orderRes = await db
    .from("orders")
    .select("id, status, total_minor, currency, created_at, paid_at")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (orderRes.error) return json({ error: "unavailable" }, 503);
  if (!orderRes.data) return json({ error: "not found" }, 404);

  const itemsRes = await db
    .from("order_items")
    .select("kind, sku, qty, unit_price_minor")
    .eq("order_id", id);

  return json({ order: orderRes.data, items: itemsRes.data ?? [] });
}
