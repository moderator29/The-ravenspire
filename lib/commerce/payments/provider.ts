/* The payment provider abstraction (V2 Part Two, section 33, Phase D).
 *
 * One interface, so the choice of processor is a swap and not a rewrite. The
 * launch provider is Stripe (lib/commerce/payments/stripe.ts): pay per
 * transaction, so zero fixed cost, which is rule 19, and PCI scope is offloaded
 * to Stripe Checkout so no card data ever touches the platform. The abstraction
 * exists anyway because a payment processor is exactly the kind of dependency a
 * platform must be able to change without touching its order logic.
 *
 * Everything here speaks integer minor units (lib/commerce/money.ts). No float
 * ever reaches a provider.
 */

import type { Currency } from "@/lib/commerce/money";

export interface CheckoutLineItem {
  /* A human label shown on the hosted checkout page. */
  name: string;
  /* Unit price in minor units. Always from the server catalog, never the
     client (rule 6). */
  unitMinor: number;
  qty: number;
}

export interface CreateCheckoutParams {
  /* The platform order this checkout settles. Carried back on the webhook so
     the event can be matched to the order without trusting the client. */
  orderId: string;
  currency: Currency;
  lineItems: CheckoutLineItem[];
  /* Where the provider returns the buyer after success or cancellation. */
  successUrl: string;
  cancelUrl: string;
  /* Idempotency at the provider: the same key never creates two sessions, so a
     retried checkout request cannot double-charge. */
  idempotencyKey: string;
  /* Optional prefilled email, when the member has one on file. */
  customerEmail?: string;
}

export interface CheckoutSession {
  /* The provider's session id, stored on the order for reconciliation. */
  id: string;
  /* The hosted page the buyer is sent to. */
  url: string;
}

/* The provider-agnostic shape of a settled (or failed) payment, parsed from a
   verified webhook. The route acts only on this, never on raw provider JSON. */
export interface PaymentEvent {
  /* The provider's unique event id, used for webhook idempotency: the same
     event id is processed at most once. */
  id: string;
  /* Normalised outcome. Unknown or irrelevant events map to "ignored" and the
     route acknowledges them without acting. */
  kind: "paid" | "failed" | "ignored";
  /* The platform order id, recovered from provider metadata. Null on ignored. */
  orderId: string | null;
  /* The provider's own payment or session reference, for the payments row. */
  providerRef: string | null;
  /* The amount the provider reports as paid, in minor units, for a
     server-side match against the order total. Null on ignored. */
  amountMinor: number | null;
  currency: Currency | null;
}

export interface PaymentProvider {
  readonly name: string;
  /* Whether the provider is configured (secrets present). A route checks this
     to fail honestly rather than attempt an unconfigured call. */
  isConfigured(): boolean;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
  /* Verify the webhook signature against the raw body and parse it. Returns
     null when the signature does not verify: a forged event never becomes a
     PaymentEvent, so it can never credit an order. */
  verifyAndParseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
}
