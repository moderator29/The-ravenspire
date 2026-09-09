/* Configuration for the realm's own listing on Pump.fun.
 *
 * One real source of truth: the mint address is set once, here, from
 * NEXT_PUBLIC_PUMPFUN_CA, and every surface that shows or links to it reads
 * this file rather than hardcoding the address or a Pump.fun URL a second
 * time. Public on purpose (NEXT_PUBLIC_): a token's mint address is
 * information the realm wants advertised, not a secret, the same posture
 * NEXT_PUBLIC_TREASURY_FEE_BPS and the other public config in .env.example
 * already takes.
 *
 * FAILS CLOSED (rule 4: real data only, never a fabricated launch). Until a
 * real mint is set, every function below answers null or false, and every
 * surface that reads one (the Ravenry banner, the landing page pill, the
 * coin page itself) renders nothing rather than a live claim about a token
 * that does not exist yet. Nothing here is seeded or invented: it is
 * plumbing that stays silent until a real address makes it real.
 */

const RAW = process.env.NEXT_PUBLIC_PUMPFUN_CA?.trim() || null;

/* Solana mint addresses are base58 (no 0, O, I or l) and 32 to 44 characters.
   A shape check, not proof the mint exists on chain, the same posture every
   other address validator in this codebase takes (lib/share/links.ts's
   HANDLE and SLUG, for instance): it exists to keep a malformed value out of
   a URL, not to be a second source of truth about the token. */
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function pumpfunContractAddress(): string | null {
  return RAW && MINT_RE.test(RAW) ? RAW : null;
}

export function pumpfunLive(): boolean {
  return pumpfunContractAddress() !== null;
}

/* Pump.fun's own public page for this mint, where a member actually buys.
   The realm's own coin page never takes an order itself; it only ever
   points here. */
export function pumpfunUrl(): string | null {
  const ca = pumpfunContractAddress();
  return ca ? `https://pump.fun/coin/${ca}` : null;
}

/* The realm's own view-only page for this coin. */
export function pumpfunCoinPagePath(): string | null {
  return pumpfunLive() ? "/pumpfun" : null;
}
