import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Currency } from "@/lib/commerce/money";
import type {
  CheckoutSession,
  CreateCheckoutParams,
  CreateRefundParams,
  PaymentEvent,
  PaymentProvider,
  RefundResult,
} from "@/lib/commerce/payments/provider";

/* The Coinbase Commerce implementation of PaymentProvider.
 *
 * Ravenspire is a non-custodial crypto platform, so the checkout is crypto, not
 * a card. Coinbase Commerce accepts ETH on Ethereum mainnet and ETH or USDC on
 * Base (which the founder enables in the Commerce dashboard), and settles funds
 * straight to the merchant's own wallet: the platform never holds a buyer's
 * assets or keys, which is the non-custodial law. Prices stay in USD and the
 * buyer pays the crypto equivalent at the hosted checkout.
 *
 * Built against the REST API with fetch and Node crypto, not an SDK: rule 19,
 * and the whole surface is one charge create and one HMAC verify, so every
 * field is visible in this file. The API key lives only in the server
 * environment and never reaches the client bundle (this module is server-only).
 *
 * Coinbase Commerce prices a charge in MAJOR units (a decimal string like
 * "34.99"), so the integer minor amounts the rest of the system speaks are
 * converted at the boundary here and nowhere else.
 */

const API = "https://api.commerce.coinbase.com";
const API_VERSION = "2018-03-22";

function apiKey(): string | null {
  return process.env.COINBASE_COMMERCE_API_KEY?.trim() || null;
}

function webhookSecret(): string | null {
  return process.env.COINBASE_COMMERCE_WEBHOOK_SECRET?.trim() || null;
}

function minorToMajor(minor: number): string {
  return (minor / 100).toFixed(2);
}

export const coinbaseProvider: PaymentProvider = {
  name: "coinbase-commerce",

  isConfigured(): boolean {
    return apiKey() !== null;
  },

  async createCheckoutSession(
    params: CreateCheckoutParams
  ): Promise<CheckoutSession> {
    const key = apiKey();
    if (!key) throw new Error("Coinbase Commerce is not configured");

    /* A charge is a single fixed price. The server has already priced every
       line from the catalog, so the total is summed here and sent as the
       amount; the line names ride along in the description for the buyer. The
       amount is never read from the client. */
    const totalMinor = params.lineItems.reduce(
      (sum, li) => sum + li.unitMinor * li.qty,
      0
    );
    const description = params.lineItems
      .map((li) => (li.qty > 1 ? `${li.qty} x ${li.name}` : li.name))
      .join(", ");

    const res = await fetch(`${API}/charges`, {
      method: "POST",
      headers: {
        "X-CC-Api-Key": key,
        "X-CC-Version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Ravenspire",
        description: description.slice(0, 200),
        pricing_type: "fixed_price",
        local_price: {
          amount: minorToMajor(totalMinor),
          currency: params.currency.toUpperCase(),
        },
        /* Recovered on the webhook to match the event to the order without
           trusting anything the client sends. */
        metadata: {
          order_id: params.orderId,
          idempotency_key: params.idempotencyKey,
        },
        redirect_url: params.successUrl,
        cancel_url: params.cancelUrl,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Coinbase charge create failed (${res.status}): ${detail}`);
    }
    const body = (await res.json()) as {
      data?: { id?: string; code?: string; hosted_url?: string };
    };
    const charge = body.data;
    if (!charge?.id || !charge.hosted_url) {
      throw new Error("Coinbase returned a charge with no id or hosted url");
    }
    return { id: charge.id, url: charge.hosted_url };
  },

  /* Crypto payments are irreversible, so there is no automated refund: a refund
     is a fresh on-chain send from the merchant wallet back to the buyer, issued
     by hand. This records the platform-side reversal (the payments row and the
     entitlement withdrawal happen in refund_order) and returns a manual marker;
     the actual crypto is sent out of band. It never pretends money moved that
     did not. */
  async refund(params: CreateRefundParams): Promise<RefundResult> {
    return {
      providerRef: "manual-onchain",
      amountMinor: params.amountMinor ?? null,
    };
  },

  verifyAndParseWebhook(
    rawBody: string,
    signature: string | null
  ): PaymentEvent | null {
    const secret = webhookSecret();
    if (!secret || !signature) return null;

    /* X-CC-Webhook-Signature is the hex HMAC-SHA256 of the exact raw body under
       the shared webhook secret. Verify in constant time. A forged body never
       matches, so it never becomes a PaymentEvent and can never credit an
       order. */
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(signature.trim(), "hex");
    } catch {
      return null;
    }
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    let payload: {
      event?: {
        id?: string;
        type?: string;
        data?: {
          id?: string;
          code?: string;
          metadata?: Record<string, unknown>;
          pricing?: { local?: { amount?: string; currency?: string } };
        };
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const event = payload.event;
    if (!event?.id || !event.type) return null;

    const data = event.data ?? {};
    const orderId =
      typeof data.metadata?.order_id === "string" ? data.metadata.order_id : null;
    const providerRef =
      typeof data.id === "string"
        ? data.id
        : typeof data.code === "string"
          ? data.code
          : null;

    const amtStr = data.pricing?.local?.amount;
    const amountMinor =
      typeof amtStr === "string" && Number.isFinite(Number(amtStr))
        ? Math.round(Number(amtStr) * 100)
        : null;
    const curRaw = data.pricing?.local?.currency;
    const currency: Currency | null =
      typeof curRaw === "string" && curRaw.toLowerCase() === "usd" ? "usd" : null;

    /* charge:confirmed and charge:resolved are a settled payment. charge:failed
       is a failure. Everything else (created, pending, delayed) is acknowledged
       without acting. */
    if (event.type === "charge:confirmed" || event.type === "charge:resolved") {
      return { id: event.id, kind: "paid", orderId, providerRef, amountMinor, currency };
    }
    if (event.type === "charge:failed") {
      return {
        id: event.id,
        kind: "failed",
        orderId,
        providerRef,
        amountMinor: null,
        currency: null,
      };
    }
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
