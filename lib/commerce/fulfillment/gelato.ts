import "server-only";
import {
  readProductMap,
  resolveLines,
  type CreateFulfillmentParams,
  type FulfillmentResult,
  type FulfillmentVendor,
} from "@/lib/commerce/fulfillment/vendor";

/* Gelato, the primary print-on-demand vendor.
 *
 * Implemented against Gelato's Order API with fetch, no SDK, same reasoning as
 * the payment provider: one HTTP call, budget zero, secret server-side only. The
 * api key is GELATO_API_KEY and the platform-to-Gelato product mapping is
 * GELATO_PRODUCT_MAP. Both must be present to be configured; with no mapping,
 * createOrder throws rather than invent a product id.
 */

const API = "https://order.gelatoapis.com/v4/orders";
const PRODUCT_MAP_ENV = "GELATO_PRODUCT_MAP";

function apiKey(): string | null {
  return process.env.GELATO_API_KEY?.trim() || null;
}

export const gelatoVendor: FulfillmentVendor = {
  name: "gelato",

  isConfigured(): boolean {
    return (
      apiKey() !== null &&
      Object.keys(readProductMap(PRODUCT_MAP_ENV)).length > 0
    );
  },

  async createOrder(
    params: CreateFulfillmentParams
  ): Promise<FulfillmentResult> {
    const key = apiKey();
    if (!key) throw new Error("Gelato is not configured");
    const lines = resolveLines(params.items, readProductMap(PRODUCT_MAP_ENV));

    const s = params.shipping;
    const body = {
      /* orderReferenceId is the platform order id. Gelato treats a repeated
         reference as the same order, so a retry does not print twice. */
      orderReferenceId: params.orderId,
      orderType: "order",
      customerReferenceId: params.orderId,
      currency: "USD",
      items: lines.map((line, i) => ({
        itemReferenceId: `${params.orderId}-${i}`,
        productUid: line.productRef,
        quantity: line.qty,
      })),
      shippingAddress: {
        firstName: s.name,
        addressLine1: s.line1,
        addressLine2: s.line2 ?? "",
        city: s.city,
        state: s.region ?? "",
        postCode: s.postalCode,
        country: s.country,
        email: s.email ?? "",
      },
    };

    const res = await fetch(API, {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gelato order create failed (${res.status}): ${detail}`);
    }
    const order = (await res.json()) as { id?: string; fulfillmentStatus?: string };
    if (!order.id) throw new Error("Gelato returned an order with no id");
    return { vendorRef: order.id, status: order.fulfillmentStatus ?? "created" };
  },
};
