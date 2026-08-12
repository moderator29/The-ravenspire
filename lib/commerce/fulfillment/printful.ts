import "server-only";
import {
  readProductMap,
  resolveLines,
  type CreateFulfillmentParams,
  type FulfillmentResult,
  type FulfillmentVendor,
} from "@/lib/commerce/fulfillment/vendor";

/* Printful, the apparel fallback.
 *
 * Same shape as the Gelato vendor: fetch against Printful's Order API, no SDK,
 * key server-side only (PRINTFUL_API_KEY), platform-to-Printful variant mapping
 * in PRINTFUL_PRODUCT_MAP (sku to sync variant id). Selected by setting
 * FULFILLMENT_VENDOR=printful. Present so the apparel side of the catalog can
 * move to Printful without touching any order logic.
 */

const API = "https://api.printful.com/orders";
const PRODUCT_MAP_ENV = "PRINTFUL_PRODUCT_MAP";

function apiKey(): string | null {
  return process.env.PRINTFUL_API_KEY?.trim() || null;
}

export const printfulVendor: FulfillmentVendor = {
  name: "printful",

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
    if (!key) throw new Error("Printful is not configured");
    const lines = resolveLines(params.items, readProductMap(PRODUCT_MAP_ENV));

    const s = params.shipping;
    const body = {
      /* external_id is the platform order id; Printful dedupes on it, so a
         retry does not create a second order. */
      external_id: params.orderId,
      recipient: {
        name: s.name,
        address1: s.line1,
        address2: s.line2 ?? "",
        city: s.city,
        state_code: s.region ?? "",
        country_code: s.country,
        zip: s.postalCode,
        email: s.email ?? "",
      },
      items: lines.map((line) => ({
        sync_variant_id: Number(line.productRef),
        quantity: line.qty,
      })),
    };

    const res = await fetch(API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Printful order create failed (${res.status}): ${detail}`);
    }
    const parsed = (await res.json()) as {
      result?: { id?: number; status?: string };
    };
    const id = parsed.result?.id;
    if (id === undefined) throw new Error("Printful returned an order with no id");
    return { vendorRef: String(id), status: parsed.result?.status ?? "created" };
  },
};
