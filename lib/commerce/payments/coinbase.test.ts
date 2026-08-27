import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coinbaseProvider } from "@/lib/commerce/payments/coinbase";

/* The webhook route once read stripe-signature and x-signature, neither of
   which Coinbase Commerce sends, so every real webhook failed verification and
   no order could ever be marked paid. These tests pin the two halves of the
   fix: the provider names the header the route must read, and a signature
   computed the way Coinbase computes it (hex HMAC-SHA256 of the exact raw body
   under the shared secret) actually verifies. */

const SECRET = "whsec_test_secret";

function sign(rawBody: string): string {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

function paidEvent(orderId: string): string {
  return JSON.stringify({
    event: {
      id: "evt_1",
      type: "charge:confirmed",
      data: {
        id: "charge_1",
        code: "ABCDEF",
        metadata: { order_id: orderId },
        pricing: { local: { amount: "34.99", currency: "USD" } },
      },
    },
  });
}

describe("coinbase webhook signature", () => {
  let prior: string | undefined;

  beforeEach(() => {
    prior = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    process.env.COINBASE_COMMERCE_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (prior === undefined) delete process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    else process.env.COINBASE_COMMERCE_WEBHOOK_SECRET = prior;
  });

  it("names the header Coinbase actually sends", () => {
    expect(coinbaseProvider.signatureHeader).toBe("x-cc-webhook-signature");
  });

  it("is found on a request carrying X-CC-Webhook-Signature, and verifies", () => {
    const raw = paidEvent("11111111-2222-4333-8444-555555555555");
    /* Header lookup is case-insensitive, exactly as the route performs it. */
    const headers = new Headers({ "X-CC-Webhook-Signature": sign(raw) });
    const signature = headers.get(coinbaseProvider.signatureHeader);
    expect(signature).not.toBeNull();

    const event = coinbaseProvider.verifyAndParseWebhook(raw, signature);
    expect(event).not.toBeNull();
    expect(event?.kind).toBe("paid");
    expect(event?.orderId).toBe("11111111-2222-4333-8444-555555555555");
    expect(event?.amountMinor).toBe(3499);
    expect(event?.currency).toBe("usd");
  });

  it("refuses a wrong signature and a tampered body", () => {
    const raw = paidEvent("11111111-2222-4333-8444-555555555555");
    expect(
      coinbaseProvider.verifyAndParseWebhook(raw, "00".repeat(32))
    ).toBeNull();
    const tampered = raw.replace("34.99", "0.01");
    expect(
      coinbaseProvider.verifyAndParseWebhook(tampered, sign(raw))
    ).toBeNull();
  });

  it("refuses when the signature header is absent", () => {
    const raw = paidEvent("11111111-2222-4333-8444-555555555555");
    const headers = new Headers({ "stripe-signature": sign(raw) });
    /* The provider's own header is what the route reads first; a body signed
       correctly but delivered under no recognised header must not verify. */
    expect(headers.get(coinbaseProvider.signatureHeader)).toBeNull();
    expect(coinbaseProvider.verifyAndParseWebhook(raw, null)).toBeNull();
  });
});
