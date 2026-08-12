import "server-only";
import {
  readProductMap,
  resolveLines,
  type CreateFulfillmentParams,
  type FulfillmentResult,
  type FulfillmentVendor,
} from "@/lib/commerce/fulfillment/vendor";

/* Prodigi, the numbered giclee print vendor.
 *
 * Prodigi is the fine-art path (numbered giclee prints for the Set One art
 * prints). Its Order API needs a print asset URL per item, which is the card
 * art hosted at a public, stable URL. That asset pipeline is a real
 * dependency that does not exist yet: no Set One print masters are hosted, so
 * this vendor is deliberately configured-aware but refuses to place an order
 * until the asset map is supplied, rather than shipping against a missing or
 * invented image.
 *
 * Key: PRODIGI_API_KEY. Product mapping: PRODIGI_PRODUCT_MAP (sku to Prodigi
 * sku). Print asset mapping: PRODIGI_ASSET_MAP (sku to public print-file URL),
 * required in addition to the product map because a print with no file is not
 * a print. Selected by FULFILLMENT_VENDOR=prodigi.
 */

const API = "https://api.prodigi.com/v4.0/Orders";
const PRODUCT_MAP_ENV = "PRODIGI_PRODUCT_MAP";
const ASSET_MAP_ENV = "PRODIGI_ASSET_MAP";

function apiKey(): string | null {
  return process.env.PRODIGI_API_KEY?.trim() || null;
}

export const prodigiVendor: FulfillmentVendor = {
  name: "prodigi",

  isConfigured(): boolean {
    return (
      apiKey() !== null &&
      Object.keys(readProductMap(PRODUCT_MAP_ENV)).length > 0 &&
      Object.keys(readProductMap(ASSET_MAP_ENV)).length > 0
    );
  },

  async createOrder(
    params: CreateFulfillmentParams
  ): Promise<FulfillmentResult> {
    const key = apiKey();
    if (!key) throw new Error("Prodigi is not configured");
    const productMap = readProductMap(PRODUCT_MAP_ENV);
    const assetMap = readProductMap(ASSET_MAP_ENV);
    const lines = resolveLines(params.items, productMap);

    const s = params.shipping;
    const body = {
      merchantReference: params.orderId,
      shippingMethod: "Standard",
      recipient: {
        name: s.name,
        email: s.email ?? "",
        address: {
          line1: s.line1,
          line2: s.line2 ?? "",
          postalOrZipCode: s.postalCode,
          countryCode: s.country,
          townOrCity: s.city,
          stateOrCounty: s.region ?? "",
        },
      },
      items: params.items.map((item, i) => {
        const asset = assetMap[item.sku];
        if (!asset) {
          throw new Error(
            `No Prodigi print asset for sku "${item.sku}". A giclee print is never placed without its print file.`
          );
        }
        return {
          merchantReference: `${params.orderId}-${i}`,
          sku: lines[i].productRef,
          copies: item.qty,
          sizing: "fillPrintArea",
          assets: [{ printArea: "default", url: asset }],
        };
      }),
    };

    const res = await fetch(API, {
      method: "POST",
      headers: { "X-API-Key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Prodigi order create failed (${res.status}): ${detail}`);
    }
    const parsed = (await res.json()) as {
      order?: { id?: string; status?: { stage?: string } };
    };
    const id = parsed.order?.id;
    if (!id) throw new Error("Prodigi returned an order with no id");
    return { vendorRef: id, status: parsed.order?.status?.stage ?? "created" };
  },
};
