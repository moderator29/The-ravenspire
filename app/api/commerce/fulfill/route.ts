import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { fulfillmentVendor } from "@/lib/commerce/fulfillment";
import type { FulfillmentLineItem } from "@/lib/commerce/fulfillment";
import { normalizeShipping } from "@/lib/commerce/shipping";
import { logger } from "@/lib/observability/log";

/* GET /api/commerce/fulfill (V2 Part Three, section 38).
 *
 * The physical fulfillment worker. It sweeps fulfillments still waiting for a
 * vendor, and for each order that carries a real shipping address it calls the
 * configured print-on-demand vendor, records the vendor's own order id, and
 * moves the fulfillment forward. Cron-callable, guarded by CRON_SECRET exactly
 * like the other cron jobs, so it can be scheduled or triggered by hand.
 *
 * IDEMPOTENT. A row is claimed by flipping its status from 'pending' to
 * 'processing' in a conditional update, so two overlapping runs never send the
 * same order twice, and the vendor call itself uses the platform order id as its
 * external reference, so even a retried claim resolves to one vendor order.
 *
 * HONEST FAILURE. A physical order is never placed against a made-up product:
 * when a sku has no vendor product mapping the vendor throws, and the row is
 * marked 'failed' with the reason rather than shipped against an invented id. An
 * order with no shipping address yet is left 'pending', not failed: it is
 * waiting, not broken.
 */

export const dynamic = "force-dynamic";

const log = logger("commerce.fulfill");

/* How many pending fulfillments one run drains. A guard, not a page: the pending
   set is small by construction and the worker runs on a schedule. */
const BATCH = 25;

/* Which order lines are physical and therefore shipped: merch always, and a
   chest only when its tier is physical. A digital chest is opened in the app and
   never sent to a printer. */
function physicalLines(
  items: { kind: string; sku: string; qty: number }[]
): FulfillmentLineItem[] {
  const out: FulfillmentLineItem[] = [];
  for (const item of items) {
    if (item.kind === "merch") {
      out.push({ sku: item.sku, qty: item.qty });
    } else if (item.kind === "chest") {
      const tier = CHEST_TIERS.find((t) => t.sku === item.sku);
      if (tier?.kind === "physical") out.push({ sku: item.sku, qty: item.qty });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "cron secret not configured" }, 503);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const vendor = fulfillmentVendor();
  if (!vendor.isConfigured()) {
    /* Nothing can ship without a configured vendor. Honest, not an error: the
       queue simply waits until the vendor and its product map are set. */
    return json({ ok: true, configured: false, processed: 0 });
  }

  const pendingRes = await db
    .from("fulfillments")
    .select("id, order_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (pendingRes.error) {
    if (pendingRes.error.code === "42P01") return json({ error: "not migrated" }, 503);
    log.error("pending fulfillments query failed", { err: pendingRes.error });
    return json({ error: "unavailable" }, 503);
  }
  const pending = (pendingRes.data ?? []) as { id: string; order_id: string }[];

  let shipped = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of pending) {
    const orderRes = await db
      .from("orders")
      .select("id, status, shipping")
      .eq("id", row.order_id)
      .maybeSingle();
    const order = orderRes.data as
      | { id: string; status: string; shipping: unknown }
      | null;
    if (!order) {
      skipped++;
      continue;
    }
    /* Only ship an order that is actually paid. A refunded or cancelled order
       with a lingering pending fulfillment is not shipped. */
    if (order.status !== "paid" && order.status !== "fulfilled") {
      skipped++;
      continue;
    }

    const shipping = normalizeShipping(order.shipping);
    if (!shipping) {
      /* Waiting on an address. Leave it pending. */
      skipped++;
      continue;
    }

    const itemsRes = await db
      .from("order_items")
      .select("kind, sku, qty")
      .eq("order_id", order.id);
    const items = (itemsRes.data ?? []) as {
      kind: string;
      sku: string;
      qty: number;
    }[];
    const lines = physicalLines(items);
    if (lines.length === 0) {
      /* A physical fulfillment with no physical line is a data problem, not a
         shipment. Mark it failed so an operator sees it rather than sweeping it
         forever. */
      await db
        .from("fulfillments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      failed++;
      continue;
    }

    /* Claim the row: flip pending to processing so a concurrent run cannot also
       take it. If the update changes no row, someone else has it. */
    const claim = await db
      .from("fulfillments")
      .update({
        status: "processing",
        vendor: vendor.name,
        shipping,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claim.error || (claim.data?.length ?? 0) === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await vendor.createOrder({
        orderId: order.id,
        items: lines,
        shipping,
      });
      await db
        .from("fulfillments")
        .update({
          vendor_ref: result.vendorRef,
          status: result.status || "submitted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      shipped++;
    } catch (err) {
      /* An unmapped product or a vendor error. Record the reason and leave it
         failed for an operator, never shipped against a guessed product. */
      log.error("vendor createOrder failed", {
        orderId: order.id,
        vendor: vendor.name,
        err,
      });
      await db
        .from("fulfillments")
        .update({
          status: "failed",
          tracking: {
            error: err instanceof Error ? err.message : String(err),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({
    ok: true,
    configured: true,
    processed: pending.length,
    shipped,
    skipped,
    failed,
  });
}
