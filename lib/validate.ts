/* Shared input validators, consolidated from the regexes that had been
 * copy-pasted around the repo (feed-server, tips, trade/record, dna and
 * friends each carried their own).
 *
 * WHY THIS FILE EXISTS. PostgREST reserves , ( ) and . inside an .or() filter
 * string, so any client value interpolated into one is filter grammar unless
 * it is proven to be a shape that cannot carry those characters. A UUID or a
 * 0x hash cannot; free text can. Every value that reaches an .or() string must
 * pass one of these first, and every route that already validated with a local
 * copy of a regex can validate with the shared one instead, so the answer to
 * "what counts as a valid id" lives in exactly one place.
 *
 * These are pure predicates over unknown input: they narrow, they never throw,
 * and they never transform (a caller that wants lowercase does that itself,
 * visibly). */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/* A v1-v5 UUID, the shape of every id column in the schema. */
export function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/* A 32-byte transaction hash, 0x-prefixed. */
export function txHash(value: unknown): value is string {
  return typeof value === "string" && TX_HASH_RE.test(value);
}

/* A 20-byte EVM address, 0x-prefixed. Checksum casing is not enforced here;
   callers that need checksum validation use viem's isAddress. */
export function evmAddress(value: unknown): value is string {
  return typeof value === "string" && EVM_ADDRESS_RE.test(value);
}

/* A non-empty string no longer than `max`. Length is measured in UTF-16 code
   units, same as the .length every route already checks against. */
export function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/* A finite integer within [min, max]. Rejects floats rather than flooring
   them, so a caller that wants to accept 3.7 as 3 must say so itself. */
export function boundedInt(
  value: unknown,
  min: number,
  max: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}
