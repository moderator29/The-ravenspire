import "server-only";
import { fulfillmentVendorName } from "@/lib/commerce/catalog";
import { gelatoVendor } from "@/lib/commerce/fulfillment/gelato";
import { printfulVendor } from "@/lib/commerce/fulfillment/printful";
import { prodigiVendor } from "@/lib/commerce/fulfillment/prodigi";
import type { FulfillmentVendor } from "@/lib/commerce/fulfillment/vendor";

/* The vendor selector. One place resolves the configured print-on-demand
   vendor from FULFILLMENT_VENDOR, so order logic never names a vendor and the
   choice is one env value. Gelato is primary; Printful and Prodigi are the
   documented fallbacks. An unknown name falls back to Gelato. */
const VENDORS: Record<string, FulfillmentVendor> = {
  gelato: gelatoVendor,
  printful: printfulVendor,
  prodigi: prodigiVendor,
};

export function fulfillmentVendor(): FulfillmentVendor {
  const name = fulfillmentVendorName();
  return VENDORS[name] ?? gelatoVendor;
}

export type {
  FulfillmentVendor,
  FulfillmentResult,
  CreateFulfillmentParams,
  FulfillmentLineItem,
  ShippingAddress,
} from "@/lib/commerce/fulfillment/vendor";
