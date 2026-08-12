import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Currency } from "@/lib/commerce/money";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  PaymentEvent,
  PaymentProvider,
} from "@/lib/commerce/payments/provider";

/* The Stripe implementation of PaymentProvider.
 *
 * Deliberately built against Stripe's REST API with fetch and Node's crypto,
 * rather than the stripe npm package. Two reasons, both house rules. Rule 19,
 * assume the budget is zero and prefer browser-native: the SDK is a large
 * dependency and everything needed here is two HTTP calls and one HMAC. Rule 6,
 * server authoritative: keeping the surface this small means every field sent
 * to Stripe is visible in one file. The secret key lives only in the server
 * environment and never reaches the client bundle (this module is server-only).
 *
 * PCI scope stays with Stripe: the buyer enters card details on Stripe's hosted
 * Checkout page, not on any Ravenspire surface, so no card data touches the
 * platform.
 */

const API = "https://api.stripe.com/v1";

function secretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/* Stripe's checkout API is form-encoded with bracketed nested keys. This walks
   a nested object into that flat shape. */
function formEncode(
  obj: Record<string, unknown>,
  prefix = "",
  out: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      formEncode(value as Record<string, unknown>, field, out);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          formEncode(item as Record<string, unknown>, `${field}[${i}]`, out);
        } else {
          out.append(`${field}[${i}]`, String(item));
        }
      });
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  isConfigured(): boolean {
    return secretKey() !== null;
  },

  async createCheckoutSession(
    params: CreateCheckoutParams
  ): Promise<CheckoutSession> {
    const key = secretKey();
    if (!key) throw new Error("Stripe is not configured");

    /* line_items[i][price_data] carries the price inline, so the amount is set
       by the server per request and never read from a Stripe-side price a
       client could name. unit_amount is minor units, exactly what Stripe
       expects, so no conversion and no float. */
    const body = formEncode({
      mode: "payment",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.orderId,
      /* Recovered on the webhook to match the event to the order. */
      metadata: { order_id: params.orderId },
      ...(params.customerEmail
        ? { customer_email: params.customerEmail }
        : {}),
      line_items: params.lineItems.map((li) => ({
        quantity: li.qty,
        price_data: {
          currency: params.currency,
          unit_amount: li.unitMinor,
          product_data: { name: li.name },
        },
      })),
    });

    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
        /* Provider-side idempotency: a retried create never makes a second
           session or a second charge. */
        "idempotency-key": params.idempotencyKey,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Stripe checkout create failed (${res.status}): ${detail}`);
    }
    const session = (await res.json()) as { id?: string; url?: string };
    if (!session.id || !session.url) {
      throw new Error("Stripe returned a session with no id or url");
    }
    return { id: session.id, url: session.url };
  },

  verifyAndParseWebhook(
    rawBody: string,
    signature: string | null
  ): PaymentEvent | null {
    const secret = webhookSecret();
    if (!secret || !signature) return null;

    /* Stripe-Signature is "t=<ts>,v1=<hex>,v1=<hex>". Verify the HMAC over
       "<t>.<rawBody>" against a v1 entry, in constant time. A mismatch, a
       missing timestamp, or an expired one all return null: a forged or replayed
       event never parses, so it can never credit an order. */
    const parts = new Map<string, string[]>();
    for (const seg of signature.split(",")) {
      const [k, v] = seg.split("=");
      if (!k || v === undefined) continue;
      const list = parts.get(k.trim()) ?? [];
      list.push(v.trim());
      parts.set(k.trim(), list);
    }
    const timestamp = parts.get("t")?.[0];
    const signatures = parts.get("v1") ?? [];
    if (!timestamp || signatures.length === 0) return null;

    /* Reject events older than five minutes: bounds the replay window even
       against a signature captured off the wire. */
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return null;
    const ageSeconds = Math.abs(Date.now() / 1000 - ts);
    if (ageSeconds > 300) return null;

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const matched = signatures.some((sig) => {
      let sigBuf: Buffer;
      try {
        sigBuf = Buffer.from(sig, "hex");
      } catch {
        return false;
      }
      return (
        sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf)
      );
    });
    if (!matched) return null;

    let event: {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event.id) return null;

    const obj = event.data?.object ?? {};
    const orderId =
      (obj.metadata as Record<string, unknown> | undefined)?.order_id;
    const orderIdStr = typeof orderId === "string" ? orderId : null;

    if (
      event.type === "checkout.session.completed" &&
      obj.payment_status === "paid"
    ) {
      const amount =
        typeof obj.amount_total === "number" ? obj.amount_total : null;
      const currency =
        typeof obj.currency === "string"
          ? (obj.currency as Currency)
          : null;
      return {
        id: event.id,
        kind: "paid",
        orderId: orderIdStr,
        providerRef: typeof obj.id === "string" ? obj.id : null,
        amountMinor: amount,
        currency,
      };
    }

    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed"
    ) {
      return {
        id: event.id,
        kind: "failed",
        orderId: orderIdStr,
        providerRef: typeof obj.id === "string" ? obj.id : null,
        amountMinor: null,
        currency: null,
      };
    }

    /* A verified event the platform does not act on. Acknowledged, not acted. */
    return {
      id: event.id,
      kind: "ignored",
      orderId: null,
      providerRef: null,
      amountMinor: null,
      currency: null,
    };
  },
};
