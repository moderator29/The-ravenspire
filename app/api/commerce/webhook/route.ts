import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { paymentProvider } from "@/lib/commerce/payments";

/* POST /api/commerce/webhook (V2 Part Two, section 33, Phase D).
 *
 * The payment provider's server-to-server notification that an order was paid.
 * This is the only place an order becomes paid: the success redirect the buyer
 * lands on is a hint, never proof, because a buyer can navigate to it without
 * paying. Proof is a signed webhook.
 *
 * THREE DEFENCES, in order:
 *   1. Signature. verifyAndParseWebhook returns null for anything whose
 *      signature does not verify against the raw body, so a forged event never
 *      becomes an action and can never credit an order.
 *   2. Event idempotency. The provider event id is inserted into payment_events,
 *      whose primary key rejects a redelivered event, so the same event is
 *      handled at most once.
 *   3. Order idempotency. The order is marked paid by a conditional update that
 *      fires only while it is still pending, so even a slipped-through duplicate
 *      grants entitlements exactly once.
 *
 * The amount is checked against the order total server-side: a paid amount that
 * does not match the order is recorded and NOT fulfilled, so a tampered or
 * mispriced session never ships goods.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const provider = paymentProvider();
  const raw = await req.text();
  const signature =
    req.headers.get("stripe-signature") ?? req.headers.get("x-signature");

  const event = provider.verifyAndParseWebhook(raw, signature);
  if (!event) return json({ error: "invalid signature" }, 400);

  /* An event we do not act on: acknowledged, no work. */
  if (event.kind === "ignored") return json({ received: true });

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Defence 2: claim the event id. A conflict means it was already delivered
     and handled, so acknowledge and stop. */
  const claim = await db
    .from("payment_events")
    .insert({
      event_id: event.id,
      provider: provider.name,
      order_id: event.orderId,
      kind: event.kind,
    });
  if (claim.error) {
    if (claim.error.code === "23505") return json({ received: true });
    if (claim.error.code === "42P01") return json({ error: "not migrated" }, 503);
    return json({ error: "unavailable" }, 503);
  }

  if (!event.orderId) return json({ received: true });

  if (event.kind === "failed") {
    await db.from("payments").insert({
      order_id: event.orderId,
      provider: provider.name,
      provider_ref: event.providerRef,
      status: "failed",
      amount_minor: event.amountMinor,
    });
    return json({ received: true });
  }

  /* event.kind === "paid". Read the order to check the amount server-side. */
  const orderRes = await db
    .from("orders")
    .select("id, profile_id, total_minor, status")
    .eq("id", event.orderId)
    .maybeSingle();
  const order = orderRes.data as
    | { id: string; profile_id: string; total_minor: number | null; status: string }
    | null;
  if (!order) return json({ received: true });

  /* Amount must match the order total exactly. A mismatch is recorded and the
     order is left unpaid: goods never ship against a wrong amount. */
  if (
    event.amountMinor === null ||
    order.total_minor === null ||
    event.amountMinor !== order.total_minor
  ) {
    await db.from("payments").insert({
      order_id: order.id,
      provider: provider.name,
      provider_ref: event.providerRef,
      status: "failed",
      amount_minor: event.amountMinor,
    });
    return json({ received: true });
  }

  /* Defence 3: mark paid only while pending. If no row updates, another
     delivery already settled it, so do not grant twice. */
  const settle = await db
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (settle.error || (settle.data?.length ?? 0) === 0) {
    return json({ received: true });
  }

  await db.from("payments").insert({
    order_id: order.id,
    provider: provider.name,
    provider_ref: event.providerRef,
    status: "succeeded",
    amount_minor: event.amountMinor,
    currency: event.currency ?? "usd",
  });

  /* Grant what was bought. Read the order's items and act per line. */
  const itemsRes = await db
    .from("order_items")
    .select("kind, sku, qty")
    .eq("order_id", order.id);
  const items = (itemsRes.data ?? []) as { kind: string; sku: string; qty: number }[];

  const entitlements: {
    profile_id: string;
    chest_sku: string;
    source_kind: string;
    source_id: string;
  }[] = [];
  let hasPhysical = false;

  for (const item of items) {
    if (item.kind !== "chest") continue;
    const tier = CHEST_TIERS.find((t) => t.sku === item.sku);
    if (!tier) continue;
    if (tier.kind === "physical") {
      /* A physical chest ships a box; its digital twins are minted from the
         printed code inside, not granted as an open-now entitlement. */
      hasPhysical = true;
    } else {
      for (let i = 0; i < item.qty; i++) {
        entitlements.push({
          profile_id: order.profile_id,
          chest_sku: item.sku,
          source_kind: "order",
          source_id: order.id,
        });
      }
    }
  }

  if (entitlements.length > 0) {
    await db.from("chest_entitlements").insert(entitlements);
  }

  if (hasPhysical) {
    /* Record a fulfillment to ship the physical box. Left pending: the vendor
       call happens in the fulfillment worker once a shipping address is on the
       order, which the checkout collects at launch. A pending row with no
       vendor ref is the honest state, not a fabricated shipment. */
    await db.from("fulfillments").insert({
      order_id: order.id,
      vendor: "pending",
      status: "pending",
    });
  }

  return json({ received: true });
}
