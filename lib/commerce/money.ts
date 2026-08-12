/* Money, as integers only (V2 Part Two, section 33, Phase D).
 *
 * Every amount that touches an order, a payment or a refund is an integer
 * count of the currency's minor unit: cents for USD. Floats are banned from
 * money for the usual reason, 0.1 + 0.2 is not 0.3, and a rounding error in a
 * charge is a real dollar taken from or given to a real person. The database
 * columns are integers, the payment providers speak minor units on the wire,
 * and this module is the only place a human-facing decimal is ever produced.
 *
 * There is exactly one currency at launch, USD, so the currency is carried
 * alongside every amount rather than assumed: adding a second one later must
 * not be a silent reinterpretation of every stored integer.
 */

export type Currency = "usd";

/* Minor units per major unit, per currency. USD has 100 cents to the dollar. */
const MINOR_PER_MAJOR: Record<Currency, number> = { usd: 100 };

export interface Money {
  /* Integer count of the minor unit. Never a float, never negative for a
     price; a refund is modelled as a separate positive amount, not a sign. */
  minor: number;
  currency: Currency;
}

export function money(minor: number, currency: Currency = "usd"): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`Money must be an integer minor amount, got ${minor}`);
  }
  return { minor, currency };
}

/* Convert a decimal major amount (4.99) to minor units (499). Rounds to the
   nearest minor unit and refuses a value that is not a clean number, so a
   config typo becomes a build error rather than a silent half-cent. */
export function majorToMinor(major: number, currency: Currency = "usd"): number {
  if (!Number.isFinite(major) || major < 0) {
    throw new Error(`Invalid major amount: ${major}`);
  }
  return Math.round(major * MINOR_PER_MAJOR[currency]);
}

/* A line total: unit price times quantity, in minor units. Quantity must be a
   positive integer, the same constraint the order_items table enforces, so a
   fractional or negative quantity can never produce a charge. */
export function lineTotal(unitMinor: number, qty: number): number {
  if (!Number.isInteger(unitMinor) || unitMinor < 0) {
    throw new Error(`Invalid unit price: ${unitMinor}`);
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`Invalid quantity: ${qty}`);
  }
  return unitMinor * qty;
}

/* Sum a set of minor-unit amounts. Empty sums to zero. */
export function sumMinor(amounts: number[]): number {
  let total = 0;
  for (const a of amounts) {
    if (!Number.isInteger(a)) throw new Error(`Non-integer amount in sum: ${a}`);
    total += a;
  }
  return total;
}

/* The one place a decimal is produced, and only for display. Never feed this
   back into any arithmetic: it is a string for a human, not a number for a
   ledger. */
export function formatMoney(m: Money): string {
  const per = MINOR_PER_MAJOR[m.currency];
  const major = m.minor / per;
  const symbol = m.currency === "usd" ? "$" : "";
  return `${symbol}${major.toFixed(2)}`;
}
