import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { chestPrice, merchPrice, pricesConfirmed } from "@/lib/commerce/catalog";
import { lineTotal, sumMinor } from "@/lib/commerce/money";
import { paymentProvider } from "@/lib/commerce/payments";
import type { CheckoutLineItem } from "@/lib/commerce/payments";
import { checkoutGuardParams, guardReasonMessage, isGuardReason } from "@/lib/commerce/compliance";
import { geoVerdict, resolveCountry } from "@/lib/commerce/geo";

/* POST /api/commerce/checkout (V2 Part Two, section 33, Phase D; guardrails in
 * section 47).
 *
 * Create a payment checkout session for a cart of chests and merch. Server
 * authoritative throughout: the price and the line total come from the server
 * catalog (lib/commerce/catalog.ts), never from the request, so a client cannot
 * name its own price (rule 6). The order and its items are written before the
 * provider is called, so every session is backed by a real, priced order.
 *
 * SEALED UNTIL LAUNCH. While chests_live is false the chest half of any cart
 * answers 423, the same sealed posture as the rest of the collectibles realm.
 * And even with the flag flipped, an unconfirmed price does not sell:
 * pricesConfirmed gates the money separately from the chapter.
 *
 * Merch sells here too. A cart may hold chests, merch, or both, and each kind
 * answers to its own chapter flag: a hoodie does not need the chests unsealed
 * to be bought, and a chest does not need the Mercer. A mixed cart needs both
 * open, because a single checkout session is a single decision to charge.
 *
 * Idempotent: the client sends an idempotency key. The same key from the same
 * member reuses the same order, and the provider's own idempotency key reuses
 * the same session, so a retried or double-clicked checkout is one charge.
 *
 * THE COMPLIANCE GUARDRAILS, which is what changed here.
 * This route used to check three things: the flag, the confirmation gate and
 * the cart. It now cannot create an order at all except through
 * public.commerce_checkout_guard, which decides the age gate, the spend caps,
 * the member's own cap, the velocity brake and the acknowledgement, and inserts
 * the order in the SAME TRANSACTION under the SAME LOCK that judged it. That
 * arrangement is not decoration. A cap read here and enforced two round trips
 * later is not a cap: ten concurrent presses each read a spend of zero and all
 * ten pass. There is deliberately no code path in this file that writes an
 * order row, so the guard cannot be bypassed by a future edit that forgets it.
 *
 * Geo is the one guardrail decided HERE rather than in the database, because
 * what it turns on is env policy and a request header rather than stored state.
 * It is applied before the guard runs and its refusal is written to the same
 * ledger. Read lib/commerce/geo.ts for the honest size of what it can do, which
 * is smaller than the word "geo" suggests.
 *
 * NOBODY WHO WROTE THIS IS A LAWYER and it claims compliance with no law. What
 * each guardrail does and does not cover is written out in
 * lib/commerce/compliance.ts, per guardrail, in plain words.
 */

export const dynamic = "force-dynamic";

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
  } | null;

  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.length <= 100
      ? body.idempotencyKey
      : null;
  if (!idempotencyKey) return json({ error: "missing idempotency key" }, 400);

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return json({ error: "empty cart" }, 400);
  }

  /* Validate and price every line against the server catalog. The client names
     a kind, a sku and a quantity, and nothing else: the price and the label
     both come from the server, so a cart cannot name its own price. */
  const lines: (CartLine & { unitMinor: number; name: string })[] = [];
  for (const raw of body.items as unknown[]) {
    const line = raw as Partial<CartLine>;
    if (
      (line.kind !== "chest" && line.kind !== "merch") ||
      typeof line.sku !== "string"
    ) {
      return json({ error: "invalid cart line" }, 400);
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return json({ error: "invalid quantity" }, 400);
    }

    if (line.kind === "chest") {
      const price = chestPrice(line.sku);
      const tier = CHEST_TIERS.find((t) => t.sku === line.sku);
      if (!price || !tier) return json({ error: "unknown chest" }, 400);
      lines.push({
        kind: "chest",
        sku: line.sku,
        qty,
        unitMinor: price.priceMinor,
        name: tier.name,
      });
    } else {
      const price = merchPrice(line.sku);
      if (!price) return json({ error: "unknown product" }, 400);
      lines.push({
        kind: "merch",
        sku: line.sku,
        qty,
        unitMinor: price.priceMinor,
        name: price.name,
      });
    }
  }

  /* Each kind answers to its own chapter. Checked after the cart is parsed
     rather than before, so a merch-only order is not turned away by a sealed
     chest chapter it never touched. */
  if (lines.some((l) => l.kind === "chest") && !(await getFlag("chests_live"))) {
    return json({ error: "The chests are sealed until launch" }, 423);
  }
  if (lines.some((l) => l.kind === "merch") && !(await getFlag("mercer_live"))) {
    return json({ error: "The Mercer is sealed until launch" }, 423);
  }

  const totalMinor = sumMinor(lines.map((l) => lineTotal(l.unitMinor, l.qty)));

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* GEO. Resolved from platform-injected headers, and only when those headers
     came from an edge we control; otherwise the answer is honestly "unknown".
     The policy is env, the default enforces nothing until the founder names a
     country, and "strict" is the only setting that refuses an unknown origin.
     None of the three stops a VPN. See lib/commerce/geo.ts. */
  const geo = resolveCountry(req.headers);
  const verdict = geoVerdict(geo);
  if (!verdict.allowed) {
    /* Written to the same refusal ledger as every database-side guardrail, so
       "show me that geo fires" has one place to look rather than two. */
    await db.rpc("commerce_guard_event", {
      p_profile_id: profile.id,
      p_kind: verdict.reason,
      p_detail: { country: verdict.country, source: verdict.source },
    });
    return json(
      { error: guardReasonMessage(verdict.reason), reason: verdict.reason },
      403
    );
  }

  /* THE GUARD, and the only way an order comes into existence. It judges and
     inserts in one transaction under one lock. A refusal carries the member's
     real numbers so the surface can say what was actually spent rather than
     "not allowed", which is the difference between an interruption and a dark
     pattern. */
  const guard = await db.rpc("commerce_checkout_guard", {
    p_profile_id: profile.id,
    p_amount_minor: totalMinor,
    p_currency: "usd",
    p_provider: provider.name,
    p_idempotency_key: idempotencyKey,
    p_geo_country: geo.country,
    p_geo_source: geo.source,
    ...checkoutGuardParams(),
  });

  if (guard.error) {
    if (guard.error.code === "42883" || guard.error.code === "42P01") {
      /* The guardrails are not migrated. FAIL CLOSED. An older version of this
         route would have created the order anyway, and a commerce route that
         degrades into "take the money without the guardrails" is the one
         failure mode this whole file exists to prevent. */
      return json({ error: "commerce is not migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const result = (guard.data ?? null) as
    | {
        ok?: boolean;
        reason?: string;
        order_id?: string;
        reused?: boolean;
        state?: Record<string, number | null>;
        clears_at?: string;
        cap_minor?: number;
        threshold_minor?: number;
        minimum?: number;
      }
    | null;

  if (!result) return json({ error: "unavailable" }, 503);

  if (result.ok !== true) {
    const reason = isGuardReason(result.reason) ? result.reason : null;
    if (!reason) return json({ error: "unavailable" }, 503);
    return json(
      {
        error: guardReasonMessage(reason),
        reason,
        /* The member's own real numbers, handed back so the surface can show
           them what they have actually spent. This is the interruption doing
           its job: a refusal with no number in it teaches nobody anything. */
        state: result.state ?? null,
        clearsAt: result.clears_at ?? null,
        capMinor: result.cap_minor ?? null,
        thresholdMinor: result.threshold_minor ?? null,
        minimum: result.minimum ?? null,
      },
      /* 409, not 403: the request is well formed and the caller is entitled to
         make it. The realm's state, or the member's own limit, is simply not
         one in which it can succeed right now. The same reading /api/chests
         uses for an absent entitlement. */
      409
    );
  }

  const orderId = result.order_id;
  if (!orderId) return json({ error: "unavailable" }, 503);

  if (result.reused !== true) {
    /* First creation of this order: write its items. A reused order already
       has them, and re-inserting would double the cart. */
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

  let session;
  try {
    session = await provider.createCheckoutSession({
      orderId,
      currency: "usd",
      lineItems: checkoutLines,
      successUrl: `${baseUrl(req)}/vault?order=${orderId}&status=success`,
      cancelUrl: `${baseUrl(req)}/warchests?checkout=cancelled`,
      idempotencyKey,
    });
  } catch {
    return json({ error: "checkout failed" }, 502);
  }

  await db
    .from("orders")
    .update({ provider_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  return json({ orderId, url: session.url });
}
