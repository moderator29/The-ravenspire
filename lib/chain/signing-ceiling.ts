import { formatEther, parseEther } from "viem";

/* The member's own ceiling on what a Ravenspire surface may ask them to sign.
 *
 * WHAT THIS IS, STATED PLAINLY BECAUSE THE COPY HAS TO SAY IT TOO
 * It binds the realm, not the member's keys. Rule 6 means the realm is never a
 * party to an on-chain transfer and holds nothing that could refuse one, so a
 * member with a ceiling set here can still open Privy's own wallet interface,
 * or connect the wallet elsewhere, and sign whatever they like. What the
 * ceiling really does is stop any Ravenspire screen building calldata worth
 * more than it. That is the guardrail against a fat finger on the Bazaar and
 * against a compromised realm surface asking for more than a member intended,
 * and it is worth having under its own honest name. The enforced version is an
 * on-chain policy on a smart account, which is dark: see
 * supabase/migrations/20260813183000_gasless_and_forgiving.sql section 3.
 *
 * WEI IS A BIGINT AND NEVER A NUMBER. One ETH is 1e18 wei and Number loses
 * exactness above 2^53, which is about 0.009 ETH. A ceiling stored or compared
 * as a Number would be wrong by more than the amounts it is meant to be
 * guarding. Every value here is a bigint in memory and a decimal string on the
 * wire, the same discipline lib/chain/claim-voucher.ts applies to its uint256
 * fields and lib/commerce/money.ts applies to cents.
 *
 * PARSING IS STRICT ON PURPOSE. viem's parseEther is happy to truncate a
 * nineteenth decimal place and to accept forms a person did not mean. This
 * module refuses anything that is not a plain decimal a human would recognise,
 * because the failure mode of a lenient parser here is a member believing they
 * set a ceiling of one thing and getting another.
 */

/* A plain decimal: digits, optionally a point and up to eighteen more digits.
   No sign, no exponent, no separators, no leading point. Every one of those
   exclusions is a thing a lenient parser would have accepted and a member would
   not have meant: "1e18" is not eighteen wei to anybody who typed it, and a
   nineteenth decimal place is a value that cannot be represented and would be
   silently discarded. */
const DECIMAL_RE = /^\d+(\.\d{1,18})?$/;

/* The largest ceiling worth accepting. A uint256 of ether would overflow the
   numeric(78,0) column, and no honest ceiling is above the supply of the asset
   anyway. Ten million ETH is beyond any real use and comfortably inside the
   column, so a value above it is a typo rather than an intention. */
export const MAX_CEILING_ETH = 10_000_000n;
export const MAX_CEILING_WEI = MAX_CEILING_ETH * 10n ** 18n;

/* A decimal string of ether to exact wei, or null when the input is not one.
   Null rather than a throw because every caller is validating member input and
   wants to answer with a sentence, not a stack trace. */
export function parseCeilingEther(input: string): bigint | null {
  const trimmed = input.trim();
  if (!DECIMAL_RE.test(trimmed)) return null;
  let wei: bigint;
  try {
    wei = parseEther(trimmed);
  } catch {
    /* Unreachable for anything DECIMAL_RE admits, and caught anyway: viem owns
       this conversion and a future version tightening it must degrade to a
       refusal rather than to an unhandled throw inside a route. */
    return null;
  }
  if (wei > MAX_CEILING_WEI) return null;
  return wei;
}

/* A decimal string of wei, exactly as the database and the wire carry it, to a
   bigint. Separate from the ether parser and deliberately not merged with it:
   these two functions take strings that look similar and mean amounts a
   billion billion apart, and a single function that guessed which one it had
   been handed would guess wrong the first time somebody passed "1". */
export function parseCeilingWei(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const wei = BigInt(trimmed);
  if (wei > MAX_CEILING_WEI) return null;
  return wei;
}

/* Wei to a human ether string for display. Trailing zeros are trimmed because
   "0.5" is what a member set and "0.500000000000000000" is what a machine
   stored, and a Ledger surface shows the reading, not the storage. */
export function formatCeilingEther(wei: bigint): string {
  const full = formatEther(wei);
  if (!full.includes(".")) return full;
  return full.replace(/\.?0+$/, "");
}

/* Whether a transaction the realm is about to build is inside the member's
 * ceiling.
 *
 * A null ceiling means the member set none, which permits everything. That is
 * the default and it is NOT the same as a ceiling of zero: zero is a member who
 * has said no Ravenspire surface may ask them to sign anything that moves value,
 * which is a real and reasonable position for somebody who only ever claims
 * cards, and it must be honoured exactly.
 *
 * The comparison is inclusive. A member who sets a ceiling of 0.1 means they
 * will sign for 0.1, not that they will sign for anything strictly below it.
 */
export function withinCeiling(
  valueWei: bigint,
  ceilingWei: bigint | null
): boolean {
  if (ceilingWei === null) return true;
  return valueWei <= ceilingWei;
}

/* The sentence a member reads when a surface refuses to build a transaction.
   It names both numbers, because "over your limit" without the limit is an
   error message that makes somebody go looking for a settings screen. */
export function overCeilingSentence(
  valueWei: bigint,
  ceilingWei: bigint
): string {
  return (
    `That would sign for ${formatCeilingEther(valueWei)} ETH, over the ` +
    `${formatCeilingEther(ceilingWei)} ETH ceiling you set. Raise it in the Vault first.`
  );
}
