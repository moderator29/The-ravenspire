import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { MERCER_SKUS } from "@/lib/collectibles/mercer";
import { chestPrice, merchPrice, pricesConfirmed } from "@/lib/commerce/catalog";
import { lineTotal, sumMinor } from "@/lib/commerce/money";
import { paymentProvider } from "@/lib/commerce/payments";
import type { CheckoutLineItem } from "@/lib/commerce/payments";
import { normalizeShipping } from "@/lib/commerce/shipping";
import { logger } from "@/lib/observability/log";

/* POST /api/commerce/checkout (V2 Part Two, section 33, Phase D).
 *
 * Create a payment checkout session for a cart of chests and merch.
 * Server-authoritative throughout: the price and the line total come from the
 * server catalog (lib/commerce/catalog.ts), never from the request, so a client
 * cannot name its own price (rule 6). The order and its items are written before
 * the provider is called, so every session is backed by a real, priced order.
 *
 * SEALED UNTIL LAUNCH. While chests_live is false the whole route answers 423,
 * the same sealed posture as the rest of the collectibles realm. And even with
 * the flag flipped, an unconfirmed price does not sell: pricesConfirmed gates
 * the money separately from the chapter (see the catalog header).
 *
 * Two sellable kinds: a chest and a merch piece. Both price from the server
 * catalog; a merch kind whose price the founder has not set has no catalog
 * entry, so its line is rejected as unknown rather than sold at a guessed price
 * (REAL DATA ONLY). Every merch piece is physical, so a merch line always
 * requires a shipping address.
 *
 * Idempotent: the client sends an idempotency key. The same key from the same
 * member reuses the same order, and the provider's own idempotency key reuses
 * the same session, so a retried or double-clicked checkout is one charge.
 */

export const dynamic = "force-dynamic";

const log = logger("commerce.checkout");

const MAX_QTY = 10;

interface CartLine {
  kind: string;
  sku: string;
  qty: number;
}

function baseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  return "https://ravenspire.app";
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const live = await getFlag("chests_live");
  if (!live) return json({ error: "The chests are sealed until launch" }, 423);

  if (!pricesConfirmed()) {
    /* The chapter is open but the prices are not confirmed. Refuse to charge
       a provisional price rather than guess. */
    return json({ error: "Pricing is not confirmed" }, 409);
  }

  const provider = paymentProvider();
  if (!provider.isConfigured()) {
    return json({ error: "Payments are not configured" }, 503);
  }

  const rl = await rateLimit(profileKey("checkout", profile.id), 20, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const body = (await req.json().catch(() => null)) as {
    items?: unknown;
    idempotencyKey?: unknown;
    shipping?: unknown;
  } | null;

  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.length <= 100
      ? body.idempotencyKey
      : null;
  if (!idempotencyKey) return json({ error: "missing idempotency key" }, 400);

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return json({ error: "empty cart" }, 400);
  }

  /* Validate and price every line against the server catalog. Two kinds sell:
     a chest (digital or the one physical box) and merch (always physical). The
     price always comes from the server catalog, never the request. */
  const lines: (CartLine & { unitMinor: number; name: string })[] = [];
  let hasPhysical = false;
  for (const raw of body.items as unknown[]) {
    const line = raw as Partial<CartLine>;
    if (typeof line.sku !== "string") {
      return json({ error: "invalid cart line" }, 400);
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return json({ error: "invalid quantity" }, 400);
    }
    if (line.kind === "merch") {
      const price = merchPrice(line.sku);
      const sku = MERCER_SKUS.find((s) => s.sku === line.sku);
      if (!price || !sku) return json({ error: "unknown merch" }, 400);
      /* Every merch piece ships, so a merch line always makes the order
         physical and an address is required below. */
      hasPhysical = true;
      lines.push({
        kind: "merch",
        sku: line.sku,
        qty,
        unitMinor: price.priceMinor,
        name: sku.name,
      });
      continue;
    }
    if (line.kind !== "chest") {
      return json({ error: "invalid cart line" }, 400);
    }
    const price = chestPrice(line.sku);
    const tier = CHEST_TIERS.find((t) => t.sku === line.sku);
    if (!price || !tier) return json({ error: "unknown chest" }, 400);
    if (tier.kind === "physical") hasPhysical = true;
    lines.push({
      kind: "chest",
      sku: line.sku,
      qty,
      unitMinor: price.priceMinor,
      name: tier.name,
    });
  }

  /* A physical chest (the King's Reliquary) ships a box, so it needs a real
     address. Validated and normalised server-side; a physical order with no
     usable address is rejected honestly rather than sold with nowhere to ship.
     A digital-only order takes no address, and one sent along is ignored. */
  const shipping = normalizeShipping(body?.shipping);
  if (hasPhysical && !shipping) {
    return json({ error: "a shipping address is required for a physical order" }, 400);
  }

  const totalMinor = sumMinor(lines.map((l) => lineTotal(l.unitMinor, l.qty)));

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Create the order, keyed by the member's idempotency key. On a duplicate
     key the existing order is reused, so a retry never creates a second. */
  let orderId: string | null = null;
  const insert = await db
    .from("orders")
    .insert({
      profile_id: profile.id,
      status: "pending",
      total_minor: totalMinor,
      currency: "usd",
      idempotency_key: idempotencyKey,
      provider: provider.name,
      /* Stored on the order for the fulfillment worker, which reads it back
         through the same normaliser. Empty jsonb for a digital-only order. */
      ...(shipping ? { shipping } : {}),
    })
    .select("id")
    .single();

  if (insert.error) {
    /* Unique violation on (profile_id, idempotency_key): reuse the order. */
    if (insert.error.code === "23505") {
      const existing = await db
        .from("orders")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      orderId = (existing.data?.id as string) ?? null;
    } else if (insert.error.code === "42P01" || insert.error.code === "42703") {
      return json({ error: "commerce is not migrated yet" }, 503);
    }
    if (!orderId) return json({ error: "unavailable" }, 503);
  } else {
    orderId = insert.data.id as string;
    /* First creation of this order: write its items. */
    const items = lines.map((l) => ({
      order_id: orderId,
      kind: l.kind,
      sku: l.sku,
      qty: l.qty,
      unit_price_minor: l.unitMinor,
    }));
    const itemsInsert = await db.from("order_items").insert(items);
    if (itemsInsert.error) return json({ error: "unavailable" }, 503);
  }

  const checkoutLines: CheckoutLineItem[] = lines.map((l) => ({
    name: l.name,
    unitMinor: l.unitMinor,
    qty: l.qty,
  }));

  /* Send a cancelled checkout back to the surface the cart came from: the
     Mercer for a merch-only cart, the Warchests otherwise. */
  const merchOnly = lines.every((l) => l.kind === "merch");
  const cancelPath = merchOnly ? "/mercer" : "/warchests";

  let session;
  try {
    session = await provider.createCheckoutSession({
      orderId: orderId as string,
      currency: "usd",
      lineItems: checkoutLines,
      successUrl: `${baseUrl(req)}/vault?order=${orderId}&status=success`,
      cancelUrl: `${baseUrl(req)}${cancelPath}?checkout=cancelled`,
      idempotencyKey,
    });
  } catch (err) {
    log.error("checkout session create failed", { orderId, err });
    return json({ error: "checkout failed" }, 502);
  }

  await db
    .from("orders")
    .update({ provider_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", orderId as string);

  return json({ orderId, url: session.url });
}
