import "server-only";
import { getFlag } from "@/lib/flags";

/* Who pays the gas, and the four locks that have to be open before the realm
 * says it does.
 *
 * THE PROBLEM THIS EXISTS FOR
 * Rule 6 is not negotiable and it has a price: a member's first act in a
 * non-custodial realm is being asked to hold ETH on Base before they can carry
 * a card they already own. Account abstraction fixes that by letting a paymaster
 * pay on their behalf, without the realm ever touching a key or taking custody.
 * A sponsored user operation is still signed by the member's own wallet; the
 * only thing that changes is whose balance the gas comes out of.
 *
 * WHAT THIS MODULE IS NOT, AND WHY THERE IS NO PAYMASTER URL IN IT
 * Read @privy-io/react-auth's `smart-wallets` entry point before assuming this
 * file is incomplete. Privy resolves the bundler URL, the paymaster URL and the
 * paymaster context for a smart wallet from configuration held in its own
 * dashboard, and delivers them to the browser inside the app config. The only
 * knob the SDK hands to application code is `paymasterContext` on
 * `SmartWalletsProvider`. There is therefore no environment variable this
 * codebase could hold that would turn sponsorship on, and a module here that
 * pretended to configure a paymaster would be describing a wire that does not
 * exist.
 *
 * What the realm owns is the POLICY: whether it is willing to sponsor, for whom,
 * how often, and what happens when it will not. That is everything below.
 *
 * THE SERVER CANNOT VERIFY THAT A PAYMASTER EXISTS, and the naming says so.
 * SPONSORSHIP_ATTESTED_CHAIN_ID is an attestation by whoever set it, not a fact
 * this process checked, because the fact lives in a dashboard this process has
 * no access to. The browser is the only place the truth is observable, via
 * whether Privy created a smart wallet for the member at all. So the honest
 * division is:
 *
 *   the server decides whether sponsorship is PERMITTED
 *   the browser decides whether sponsorship is POSSIBLE
 *   a surface may promise "no gas" only when both say yes
 *
 * and when the server permits it but the browser finds no smart account, the
 * surface says so out loud and the member acts the ordinary way. Never a dead
 * button, and never a silent fallback that charges somebody gas they were told
 * was covered. See components/wallet/use-sponsorship.ts for the composition.
 *
 * WHY THE BUDGET IS COUNTED IN ACTS
 * Pricing gas in fiat needs an ETH price, which needs an oracle, which is a
 * dependency bought so a budget can be marginally more precise, and it puts a
 * float in the middle of a spending limit. An act is an integer and cannot
 * drift. The conversion is a sum the founder does once against whatever the
 * paymaster's free tier really is, and it is written down in
 * docs/RAVENSPIRE-V2.md section 51 so the next person can check it.
 */

/* The rolling window every allowance is measured over. Thirty days, matching
   the commerce month window, because a paymaster's free tier resets monthly and
   a budget on a different clock to the bill is a budget that surprises somebody. */
export const SPONSORSHIP_WINDOW_HOURS = 720;

/* What one member may have the realm pay for in a window. Deliberately small.
   This is an onboarding subsidy, not a standing benefit: the acts that lose new
   members are the first few, and a member on their eleventh claim has already
   learned what gas is. It also bounds the damage a single determined account
   can do to a shared budget to under one percent of it. */
export const SPONSORED_ACTS_PER_MEMBER = 10;

/* What the realm will pay for across everybody in a window, and the single most
   important number in this file, because it is the one standing between a free
   tier and an invoice. Set against the paymaster's actual free allowance with
   room to spare: see section 51 for the arithmetic. When this is exhausted the
   realm stops sponsoring and says so; it never rolls over into paid usage,
   which is the failure mode rule 19 exists to prevent. */
export const SPONSORED_ACTS_PER_REALM = 1200;

/* How long a reservation may sit unresolved before the budget takes it back.
   A member who opened a wallet prompt and walked away should not hold a slot
   forever, and thirty minutes is far longer than any wallet interaction and far
   shorter than a window. */
export const SPONSORSHIP_STALE_MINUTES = 30;

/* How long a raise to a member's own signing ceiling waits. The same day the
   commerce self-cap waits, for the same reason and not because they are the
   same feature: a limit that lifts the moment you want it lifted is a slider. */
export const CEILING_RAISE_DELAY_HOURS = 24;

/* The acts the realm is willing to sponsor. A closed set, because sponsorship
   is a decision per act and a new one should require somebody to think about
   whether the realm wants to pay for it rather than inheriting a yes. */
export const SPONSORED_ACTS = ["claim", "craft", "bazaar-pull"] as const;
export type SponsoredAct = (typeof SPONSORED_ACTS)[number];

export function isSponsoredAct(value: unknown): value is SponsoredAct {
  return (
    typeof value === "string" &&
    (SPONSORED_ACTS as readonly string[]).includes(value)
  );
}

/* The chain the founder has attested a paymaster is configured for, or null.
   Absent is the normal state and every caller degrades to "the member pays",
   which is exactly what happens today and has always worked. */
export function attestedChainId(): number | null {
  const raw = process.env.SPONSORSHIP_ATTESTED_CHAIN_ID?.trim();
  if (!raw) return null;
  const id = Number(raw);
  /* A typo reads as unconfigured rather than throwing. A malformed environment
     variable must never take a page down, and the safe direction here is that
     the member pays their own gas, which is the ordinary path. */
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* Why the realm is not paying. A closed union rather than free text, because
   each of these is a different sentence to a member and two of them are not
   even problems: `sealed` and `unconfigured` are the ordinary state of a realm
   that has not turned sponsorship on, while the two allowance reasons mean the
   feature is working exactly as designed. */
export type UnsponsoredReason =
  | "sealed"
  | "unconfigured"
  | "wrong-chain"
  | "member-allowance"
  | "realm-allowance";

export type SponsorshipVerdict =
  | { payer: "realm" }
  | { payer: "member"; reason: UnsponsoredReason };

export type SponsorshipInputs = {
  /* The gasless_live flag. */
  flagLive: boolean;
  /* The chain the act would happen on. */
  chainId: number;
  /* What SPONSORSHIP_ATTESTED_CHAIN_ID resolved to. */
  attestedChainId: number | null;
  memberUsed: number;
  memberAllowance: number;
  realmUsed: number;
  realmAllowance: number;
};

/* The whole decision, as one pure function, so it can be tested exhaustively
 * without a database, a chain or a browser.
 *
 * THE ORDER OF THE CHECKS IS THE POINT and it runs cheapest-and-most-permanent
 * first. A sealed realm is a fact about the product; an exhausted allowance is a
 * fact about this month. Reporting the second when the first is also true would
 * tell a member to come back next month about a feature that does not exist yet.
 *
 * There is no default-yes anywhere in here. Every path that is not an explicit
 * open lock returns `member`, so a future field added to the inputs cannot
 * accidentally make the realm pay for something.
 */
export function decideSponsorship(input: SponsorshipInputs): SponsorshipVerdict {
  if (!input.flagLive) return { payer: "member", reason: "sealed" };
  if (input.attestedChainId === null) {
    return { payer: "member", reason: "unconfigured" };
  }
  /* A paymaster is configured per chain. Sponsoring on a chain nobody attested
     would mean building a user operation against a bundler that is not there,
     which fails in the member's wallet after they have already committed. */
  if (input.attestedChainId !== input.chainId) {
    return { payer: "member", reason: "wrong-chain" };
  }
  /* The member's own allowance before the realm's, because a member at their
     limit needs a different sentence from a realm at its limit: theirs resets
     for them, the realm's resets for everybody. */
  if (input.memberUsed >= input.memberAllowance) {
    return { payer: "member", reason: "member-allowance" };
  }
  if (input.realmUsed >= input.realmAllowance) {
    return { payer: "member", reason: "realm-allowance" };
  }
  return { payer: "realm" };
}

/* The sentence a member reads. Kept beside the union so a new reason cannot be
   added without one, and written so that none of them sounds like a failure:
   in every case the member can still act, and the only thing that changes is
   whose balance the gas comes from. */
export function unsponsoredSentence(reason: UnsponsoredReason): string {
  switch (reason) {
    case "sealed":
      return "The realm is not covering gas yet. You pay your own, as always.";
    case "unconfigured":
      return "Gas cover is not set up in this environment. You pay your own.";
    case "wrong-chain":
      return "The realm only covers gas on one chain, and this is not it. You pay your own here.";
    case "member-allowance":
      return "You have used the gas the realm covers this month. You pay your own from here.";
    case "realm-allowance":
      return "The realm's gas cover is spent for this month. You pay your own until it resets.";
  }
}

/* What the server can decide on its own, before a browser has said whether a
   smart account exists. Reads the flag and the attestation only; the two
   allowance counters live in the database and are added by the route, which is
   the only place that can count them under a lock. */
export async function sponsorshipPermitted(chainId: number): Promise<
  { permitted: true } | { permitted: false; reason: UnsponsoredReason }
> {
  const flagLive = await getFlag("gasless_live");
  if (!flagLive) return { permitted: false, reason: "sealed" };
  const attested = attestedChainId();
  if (attested === null) return { permitted: false, reason: "unconfigured" };
  if (attested !== chainId) return { permitted: false, reason: "wrong-chain" };
  return { permitted: true };
}
