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

/* A fee taken out of an amount, in integer minor units.
 *
 * WHY THIS IS HERE AND NOT IN THE MARKET. A fee split is money arithmetic, and
 * money arithmetic lives in one module in this codebase. Writing
 * `price * 0.05` at the call site is the exact mistake the header of this file
 * exists to prevent: 2999 * 0.05 is 149.95000000000002 in IEEE 754, and the
 * two obvious ways to force that back to an integer disagree about the cent.
 *
 * ROUNDING IS HALF UP, AND IT IS DECIDED HERE ONCE. The only rule that
 * actually matters is that the two halves add back up to the whole, exactly,
 * with no cent invented and none lost, which is asserted below and tested.
 * The net is derived by subtraction rather than by a second rounding, because
 * two independently rounded halves are how a ledger ends up a cent short of
 * itself.
 *
 * Basis points rather than a percentage: 500 bps is 5%, and an integer rate
 * cannot be typed as 0.05 by one caller and 5 by another. */
export interface FeeSplit {
  /* What the payer pays. */
  totalMinor: number;
  /* What the fee taker receives. */
  feeMinor: number;
  /* What the counterparty receives. Always exactly total minus fee. */
  netMinor: number;
  bps: number;
}

export function splitFee(totalMinor: number, bps: number): FeeSplit {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new Error(`Invalid amount to split: ${totalMinor}`);
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`Invalid fee rate: ${bps} bps`);
  }
  /* Integer throughout. `totalMinor * bps` is an exact integer for every
     amount this product can charge, and the `+ 5_000` before the floor is what
     makes it round half up rather than toward zero. */
  const feeMinor = Math.floor((totalMinor * bps + 5_000) / 10_000);
  const netMinor = totalMinor - feeMinor;
  /* Never reachable for bps within range, and asserted anyway: a negative net
     would mean a seller paying to sell. */
  if (netMinor < 0) {
    throw new Error(`Fee ${feeMinor} exceeds the amount ${totalMinor}`);
  }
  return { totalMinor, feeMinor, netMinor, bps };
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
