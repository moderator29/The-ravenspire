import type { ShippingAddress } from "@/lib/commerce/fulfillment/vendor";

/* Shipping address normalisation (V2 Part Three, section 38).
 *
 * One place turns a shipping object from a request body, or a shipping jsonb
 * read back off an order, into the canonical ShippingAddress the vendors expect.
 * The checkout route validates and stores through this, and the fulfillment
 * worker reads through the same function, so the shape the store sends, the
 * shape persisted, and the shape handed to a vendor can never drift apart.
 *
 * Lenient on input, strict on output. A person's checkout form and a print
 * vendor name the same field differently (postalCode, postal_code, zip; region,
 * state, province; line1, address1), so the reader accepts the common spellings
 * and emits exactly one canonical shape. A required field missing means the
 * address is not usable, and the function returns null rather than guess: a
 * physical order with no real address is rejected honestly, never shipped to a
 * fabricated one (rule 4).
 */

/* A generous per-field cap. An address line is short; anything longer is either
   a mistake or an attempt to stuff the jsonb, and neither ships. */
const MAX_FIELD = 200;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "";
}

function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

/* Normalise a shipping object into a ShippingAddress, or null when a required
   field (name, line1, city, postalCode, country) is absent. */
export function normalizeShipping(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  const name = firstStr(s.name, s.fullName, s.full_name);
  const line1 = firstStr(s.line1, s.address1, s.address, s.line, s.street);
  const city = str(s.city);
  /* `postal` is first among the spellings because it is the one the realm's
     own two stores send. The reader was written from the vendors' side and
     accepted every spelling except that one, so the address a member typed at
     checkout normalised to null and their box would have sat pending forever
     with no field missing from the form. Lenient on input is only lenient if
     it covers the input you actually receive. */
  const postalCode = firstStr(
    s.postal,
    s.postalCode,
    s.postal_code,
    s.zip,
    s.zipcode,
    s.postcode
  );
  let country = firstStr(s.country, s.countryCode, s.country_code);
  if (!name || !line1 || !city || !postalCode || !country) return null;

  /* A two-letter country is treated as an ISO alpha-2 code and upcased, which
     is what the vendors want. A longer value (a full country name) is passed
     through untouched. */
  if (country.length === 2) country = country.toUpperCase();

  const line2 = firstStr(s.line2, s.address2);
  const region = firstStr(s.region, s.state, s.province);
  const email = firstStr(s.email);

  return {
    name,
    line1,
    ...(line2 ? { line2 } : {}),
    city,
    ...(region ? { region } : {}),
    postalCode,
    country,
    ...(email ? { email } : {}),
  };
}
