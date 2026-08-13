/* The fulfillment vendor abstraction (V2 Part Two, section 33, item 7).
 *
 * Physical orders (the King's Reliquary, the Mercer merch) are printed and
 * shipped by a print-on-demand vendor. The founder's intent is one primary
 * vendor, Gelato (apparel, fine-art prints and global fulfillment, no fixed
 * cost), with Printful as an apparel fallback and Prodigi
 * for numbered giclee prints. A vendor is exactly the sort of choice that
 * changes, so it sits behind this interface and the pick is an env value
 * (FULFILLMENT_VENDOR), not a code change.
 *
 * No vendor product ids are invented here. A platform sku maps to a vendor
 * product only through real, configured mappings; until those exist, creating a
 * fulfillment fails honestly rather than shipping against a made-up product.
 */

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  /* State or province, where the country uses one. */
  region?: string;
  postalCode: string;
  /* ISO 3166-1 alpha-2, e.g. "US". */
  country: string;
  email?: string;
}

export interface FulfillmentLineItem {
  /* The platform sku (a chest or merch sku). Mapped to the vendor's own
     product reference by the vendor implementation. */
  sku: string;
  qty: number;
}

export interface CreateFulfillmentParams {
  /* The platform order, used as the vendor's external reference so the two
     systems reconcile and a retry is idempotent at the vendor. */
  orderId: string;
  items: FulfillmentLineItem[];
  shipping: ShippingAddress;
}

export interface FulfillmentResult {
  /* The vendor's own order id, stored on the fulfillment row. */
  vendorRef: string;
  /* Normalised status at creation: usually "created" or "pending". */
  status: string;
}

export interface FulfillmentVendor {
  readonly name: string;
  /* Whether the vendor is configured (api key and product mappings present). */
  isConfigured(): boolean;
  createOrder(params: CreateFulfillmentParams): Promise<FulfillmentResult>;
}

/* The platform-sku to vendor-product map, read from an env JSON value per
   vendor. Empty until real product ids exist, which is the honest default:
   with no mapping, a vendor cannot create an order and says so. The value is
   a JSON object of { "<platform sku>": "<vendor product ref>" }.

   Example env: GELATO_PRODUCT_MAP={"obsidian-tee":"apparel_...uid..."}. */
export function readProductMap(envName: string): Record<string, string> {
  const raw = process.env[envName];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v) out[k] = v;
      }
      return out;
    }
  } catch {
    /* A malformed map is treated as no map: fail honestly, never guess. */
  }
  return {};
}

/* Resolve every line to its vendor product ref, or throw naming the first sku
   with no mapping. Shared by the vendor implementations so none of them can
   quietly drop or invent a line. */
export function resolveLines(
  items: FulfillmentLineItem[],
  map: Record<string, string>
): { productRef: string; qty: number }[] {
  return items.map((item) => {
    const productRef = map[item.sku];
    if (!productRef) {
      throw new Error(
        `No vendor product mapping for sku "${item.sku}". A physical order is never placed against an unmapped product.`
      );
    }
    return { productRef, qty: item.qty };
  });
}
