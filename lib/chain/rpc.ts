import "server-only";

/* Where the realm reads the chain, per chain.
 *
 * Every EVM chain the product touches (tips ride whatever chain the member's
 * wallet is on, trades ride the chains lib/trade/config.ts allows), resolved to
 * one RPC endpoint. Free tier throughout, per rule 19: the existing Alchemy key
 * already covers all of them, and no new paid dependency is introduced to read
 * a receipt.
 *
 * ABSENT IS A WORKING STATE, and it has to be. This module returns null when a
 * chain has no endpoint configured, and every caller degrades honestly rather
 * than guessing: an unverified transfer is recorded as unverified and kept out
 * of the shared feed, never rejected as fake and never accepted as proven.
 * Failing closed on a missing key would take tipping down for everyone the
 * first time an environment shipped without one.
 *
 * A rate-limited public endpoint is deliberately not a fallback. Reading a
 * receipt off one is how a real transfer gets told it never happened, and this
 * verification decides whether somebody's tribute counts.
 */

/* Alchemy's network slug per chain id. These are the chains the product can
   actually produce a transaction on: the trade chains, plus Ethereum and the
   two testnets a rehearsal uses. */
const ALCHEMY_NETWORK: Record<number, string> = {
  1: "eth-mainnet",
  10: "opt-mainnet",
  56: "bnb-mainnet",
  137: "polygon-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  43114: "avax-mainnet",
  11155111: "eth-sepolia",
  84532: "base-sepolia",
};

/* An explicit override map, as JSON: {"8453":"https://..."}. Parsed once. A
   malformed value is ignored rather than thrown, because a typo in an
   environment variable must not take the product down; the chains it would
   have covered simply read as unconfigured, which every caller handles. */
let overrides: Record<string, string> | null | undefined;

function overrideFor(chainId: number): string | null {
  if (overrides === undefined) {
    const raw = process.env.EVM_RPC_URLS?.trim();
    if (!raw) {
      overrides = null;
    } else {
      try {
        const parsed = JSON.parse(raw) as unknown;
        overrides =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, string>)
            : null;
      } catch {
        overrides = null;
      }
    }
  }
  const url = overrides?.[String(chainId)];
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

export function rpcUrl(chainId: number): string | null {
  const explicit = overrideFor(chainId);
  if (explicit) return explicit;

  const network = ALCHEMY_NETWORK[chainId];
  if (!network) return null;
  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (!key) return null;
  return `https://${network}.g.alchemy.com/v2/${key}`;
}

/* Whether the realm can check its own claims about this chain. Surfaces read
   this to say so out loud rather than implying a verification that is not
   happening. */
export function canVerifyChain(chainId: number): boolean {
  return rpcUrl(chainId) !== null;
}
