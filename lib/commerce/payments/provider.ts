/* The payment provider abstraction (V2 Part Two, section 33, Phase D).
 *
 * One interface, so the choice of processor is a swap and not a rewrite. The
 * provider is Coinbase Commerce (lib/commerce/payments/coinbase.ts): a
 * non-custodial crypto checkout that accepts ETH on mainnet and ETH or USDC on
 * Base and settles to the merchant's own wallet, which is the platform's
 * non-custodial law and fits a crypto platform. The abstraction exists anyway
 * because a payment processor is exactly the kind of dependency a platform must
 * be able to change without touching its order logic.
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

/* Ask the provider to reverse a settled payment. Amount omitted means a full
   refund. The order id is carried for the provider's own records and so a
   refund can be matched back without trusting the client. */
export interface CreateRefundParams {
  orderId: string;
  /* The provider session reference stored on the order at checkout, from which
     the provider resolves the charge or payment intent to refund. */
  sessionRef: string | null;
  /* Minor units to refund. Null or omitted refunds the full captured amount. */
  amountMinor?: number | null;
}

export interface RefundResult {
  /* The provider's own refund id, recorded on the refunded payments row. */
  providerRef: string | null;
  /* The amount the provider reports as refunded, in minor units. */
  amountMinor: number | null;
}

/* The provider-agnostic shape of a settled (or failed) payment, parsed from a
   verified webhook. The route acts only on this, never on raw provider JSON. */
export interface PaymentEvent {
  /* The provider's unique event id, used for webhook idempotency: the same
     event id is processed at most once. */
  id: string;
  /* Normalised outcome. Unknown or irrelevant events map to "ignored" and the
     route acknowledges them without acting. A "refunded" event is a
     provider-initiated reversal (a refund issued from the provider dashboard). */
  kind: "paid" | "failed" | "refunded" | "ignored";
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
  /* The request header the provider carries its webhook signature in,
     lowercase. The webhook route reads this rather than naming a processor's
     header itself, which is the whole point of the abstraction: the route once
     hardcoded another processor's header name, so every real webhook arrived
     unsigned as far as verification could tell and no order could ever be
     marked paid. */
  readonly signatureHeader: string;
  /* Whether the provider is configured (secrets present). A route checks this
     to fail honestly rather than attempt an unconfigured call. */
  isConfigured(): boolean;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
  /* Reverse a captured payment at the provider. Throws when the provider is not
     configured or the reversal is rejected, so the caller records a refund only
     after the money has actually moved. */
  refund(params: CreateRefundParams): Promise<RefundResult>;
  /* Verify the webhook signature against the raw body and parse it. Returns
     null when the signature does not verify: a forged event never becomes a
     PaymentEvent, so it can never credit an order. */
  verifyAndParseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
}
