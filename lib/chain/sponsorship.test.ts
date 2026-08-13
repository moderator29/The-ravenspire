import { describe, expect, it } from "vitest";
import {
  decideSponsorship,
  isSponsoredAct,
  SPONSORED_ACTS,
  SPONSORED_ACTS_PER_MEMBER,
  SPONSORED_ACTS_PER_REALM,
  unsponsoredSentence,
  type SponsorshipInputs,
  type UnsponsoredReason,
} from "@/lib/chain/sponsorship";

/* The gate, exhaustively, with no chain and no database anywhere near it.
 *
 * decideSponsorship is pure precisely so this file can exist. Every one of these
 * cases is a real state the realm will be in: sealed on day one, configured but
 * on the wrong chain during a Base Sepolia rehearsal, and both allowances
 * exhausted, which is the state that decides whether rule 19 holds or whether
 * somebody gets an invoice.
 */

/* The all-locks-open baseline. Every test below changes exactly one thing from
   this, so a failure names the field that caused it. */
const OPEN: SponsorshipInputs = {
  flagLive: true,
  chainId: 8453,
  attestedChainId: 8453,
  memberUsed: 0,
  memberAllowance: SPONSORED_ACTS_PER_MEMBER,
  realmUsed: 0,
  realmAllowance: SPONSORED_ACTS_PER_REALM,
};

describe("decideSponsorship", () => {
  it("lets the realm pay only when every lock is open", () => {
    expect(decideSponsorship(OPEN)).toEqual({ payer: "realm" });
  });

  it("refuses when the flag is down, whatever else is true", () => {
    expect(decideSponsorship({ ...OPEN, flagLive: false })).toEqual({
      payer: "member",
      reason: "sealed",
    });
  });

  it("refuses when no chain has been attested", () => {
    expect(decideSponsorship({ ...OPEN, attestedChainId: null })).toEqual({
      payer: "member",
      reason: "unconfigured",
    });
  });

  it("refuses on a chain nobody attested a paymaster for", () => {
    /* The Base Sepolia rehearsal against a mainnet attestation. Sponsoring here
       would build a user operation against a bundler that is not there and fail
       in the member's wallet after they had already committed. */
    expect(decideSponsorship({ ...OPEN, chainId: 84532 })).toEqual({
      payer: "member",
      reason: "wrong-chain",
    });
  });

  it("refuses when the member has spent their own allowance", () => {
    expect(
      decideSponsorship({ ...OPEN, memberUsed: SPONSORED_ACTS_PER_MEMBER })
    ).toEqual({ payer: "member", reason: "member-allowance" });
  });

  it("still pays on the member's last act, not one short of it", () => {
    /* Off-by-one in the permissive direction here would hand out one free act
       too many per member per month; in the strict direction it would silently
       shorten every member's allowance by one. The boundary is worth pinning. */
    expect(
      decideSponsorship({ ...OPEN, memberUsed: SPONSORED_ACTS_PER_MEMBER - 1 })
    ).toEqual({ payer: "realm" });
  });

  it("refuses when the realm's budget is spent", () => {
    expect(
      decideSponsorship({ ...OPEN, realmUsed: SPONSORED_ACTS_PER_REALM })
    ).toEqual({ payer: "member", reason: "realm-allowance" });
  });

  it("still pays on the realm's last act", () => {
    expect(
      decideSponsorship({ ...OPEN, realmUsed: SPONSORED_ACTS_PER_REALM - 1 })
    ).toEqual({ payer: "realm" });
  });

  it("never pays when a counter has somehow overshot its allowance", () => {
    /* A released grant swept late, a clock skew, an allowance lowered while
       grants were live: the counter can legitimately exceed the allowance, and
       a strict equality check would have started paying again at that point. */
    expect(
      decideSponsorship({ ...OPEN, realmUsed: SPONSORED_ACTS_PER_REALM + 50 })
    ).toEqual({ payer: "member", reason: "realm-allowance" });
  });

  it("never pays against a zero allowance", () => {
    /* The kill switch. Setting either allowance to zero must stop sponsorship
       dead rather than being read as "no limit". */
    expect(decideSponsorship({ ...OPEN, realmAllowance: 0 })).toEqual({
      payer: "member",
      reason: "realm-allowance",
    });
    expect(decideSponsorship({ ...OPEN, memberAllowance: 0 })).toEqual({
      payer: "member",
      reason: "member-allowance",
    });
  });

  it("reports the most permanent reason when several are true at once", () => {
    /* A sealed realm is a fact about the product; an exhausted allowance is a
       fact about this month. Telling a member to come back next month about a
       feature that does not exist yet is the wrong sentence. */
    expect(
      decideSponsorship({
        ...OPEN,
        flagLive: false,
        attestedChainId: null,
        memberUsed: 99,
        realmUsed: 99_999,
      })
    ).toEqual({ payer: "member", reason: "sealed" });
  });

  it("prefers the member's own limit over the realm's when both are spent", () => {
    /* Different sentences: the member's resets for them, the realm's resets for
       everybody, and a member told the realm is out of money when it is their
       own allowance would go looking for the wrong thing. */
    expect(
      decideSponsorship({
        ...OPEN,
        memberUsed: SPONSORED_ACTS_PER_MEMBER,
        realmUsed: SPONSORED_ACTS_PER_REALM,
      })
    ).toEqual({ payer: "member", reason: "member-allowance" });
  });
});

describe("the honest degradation", () => {
  it("gives every refusal a sentence a member can act on", () => {
    const reasons: UnsponsoredReason[] = [
      "sealed",
      "unconfigured",
      "wrong-chain",
      "member-allowance",
      "realm-allowance",
    ];
    for (const reason of reasons) {
      const sentence = unsponsoredSentence(reason);
      expect(sentence.length).toBeGreaterThan(20);
      /* Every refusal has to leave the member able to act, so every sentence
         says who pays instead. A refusal that only said "no" would be the dead
         button this whole module exists to avoid. */
      expect(sentence.toLowerCase()).toContain("you pay");
    }
  });

  it("never promises the realm pays in a refusal sentence", () => {
    expect(unsponsoredSentence("realm-allowance")).not.toMatch(/free|covered\b/i);
  });
});

describe("the sponsored act set", () => {
  it("is closed", () => {
    expect(isSponsoredAct("claim")).toBe(true);
    expect(isSponsoredAct("tip")).toBe(false);
    expect(isSponsoredAct("")).toBe(false);
    expect(isSponsoredAct(null)).toBe(false);
    expect(isSponsoredAct(1)).toBe(false);
  });

  it("fits the column the ledger stores it in", () => {
    /* wallet_sponsorship_grants_act_check caps act at 40 characters. A name
       longer than that would insert fine in a test and fail in production. */
    for (const act of SPONSORED_ACTS) {
      expect(act.length).toBeGreaterThan(0);
      expect(act.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("the realm budget", () => {
  it("keeps one member well under the shared allowance", () => {
    /* The property that matters is not the exact numbers, which will be tuned,
       but that no single account can drink the realm's budget. One percent is
       the line: above that, twenty determined accounts empty the month. */
    expect(SPONSORED_ACTS_PER_MEMBER / SPONSORED_ACTS_PER_REALM).toBeLessThan(
      0.01
    );
  });

  it("is a finite integer, so it can actually stop", () => {
    /* A budget that is Infinity, NaN or fractional is not a budget, and this is
       the one number standing between a free tier and an invoice nobody agreed
       to (rule 19). */
    expect(Number.isSafeInteger(SPONSORED_ACTS_PER_REALM)).toBe(true);
    expect(SPONSORED_ACTS_PER_REALM).toBeGreaterThan(0);
    expect(Number.isSafeInteger(SPONSORED_ACTS_PER_MEMBER)).toBe(true);
    expect(SPONSORED_ACTS_PER_MEMBER).toBeGreaterThan(0);
  });
});
