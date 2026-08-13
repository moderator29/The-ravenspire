import { describe, it, expect } from "vitest";
import {
  BAZAAR_MEMBER_SHARE_BPS,
  REVENUE_STREAMS,
  payingStreams,
  streamBySlug,
} from "@/lib/economy/revenue";
import { MARKET_FEE_BPS, quoteFor } from "@/lib/commerce/market";

/* The register is the platform's own statement about what it pays members and
   what it keeps. Every case here is a way that statement could become a lie:
   by promising a share of a stream that does not exist, by promising a share it
   would have to hold a member's money to deliver, or by quoting terms the code
   taking the money does not honour. */

describe("the register is complete and internally consistent", () => {
  it("gives every stream a payer, even the ones paying nothing", () => {
    for (const s of REVENUE_STREAMS) {
      expect(s.payer.length).toBeGreaterThan(0);
      expect(s.terms.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate slugs", () => {
    const slugs = REVENUE_STREAMS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves a slug and refuses one it does not know", () => {
    expect(streamBySlug("tribute")?.name).toBe("Tributes");
    expect(streamBySlug("a-stream-somebody-wished-for")).toBeNull();
  });
});

describe("split at source, never accrue", () => {
  /* The whole doctrine. A share the platform receives first and forwards later
     is an accrued balance, and the platform holding money it owes a member is
     custody whatever it is called. The module refuses to load with one, so this
     asserts the property the assertion protects. */
  it("settles every member share in the payer's own transaction", () => {
    for (const s of payingStreams()) {
      expect(s.settlement).toBe("at-source");
      expect(s.rail).toBe("wallet");
    }
  });

  it("shares nothing at all over a rail that cannot split a payment", () => {
    for (const s of REVENUE_STREAMS) {
      if (s.rail !== "wallet") expect(s.memberShareBps).toBe(0);
    }
  });

  it("has no stream that pays a member without a wallet on the other end", () => {
    expect(payingStreams().every((s) => s.producesRevenue)).toBe(true);
  });
});

describe("do not invent a revenue stream to share", () => {
  it("declares no split on a surface where no money changes hands", () => {
    for (const s of REVENUE_STREAMS) {
      if (!s.producesRevenue) {
        expect(s.memberShareBps).toBe(0);
        expect(s.platformShareBps).toBe(0);
        expect(s.settlement).toBe("none");
      }
    }
  });

  it("names a Call as a surface that earns standing and not money", () => {
    const call = streamBySlug("call-resolution");
    expect(call?.producesRevenue).toBe(false);
    expect(call?.terms).toMatch(/not money/i);
  });

  it("makes a real stream that shares nothing say what it is waiting on", () => {
    for (const s of REVENUE_STREAMS) {
      if (s.producesRevenue && s.memberShareBps === 0) {
        expect(s.waitingOn && s.waitingOn.length > 20).toBe(true);
      }
    }
  });

  it("explains the commerce refusal in terms of custody, not of effort", () => {
    const commerce = streamBySlug("commerce-order");
    expect(commerce?.memberShareBps).toBe(0);
    expect(commerce?.waitingOn).toMatch(/holding your money/);
  });
});

describe("the splits are whole", () => {
  it("splits every real stream into exactly ten thousand basis points", () => {
    for (const s of REVENUE_STREAMS) {
      if (s.producesRevenue) {
        expect(s.memberShareBps + s.platformShareBps).toBe(10_000);
      }
    }
  });

  it("pays a tribute entirely to the member", () => {
    const tribute = streamBySlug("tribute");
    expect(tribute?.memberShareBps).toBe(10_000);
    expect(tribute?.platformShareBps).toBe(0);
    expect(tribute?.sealedBy).toBeNull();
  });
});

describe("the register and the market cannot disagree", () => {
  /* The one cross check that matters. The register is what a member reads
     before they list a card; lib/commerce/market.ts is what charges them. A
     register quoting 95% beside a market taking 8% would be the platform lying
     on its own earnings page, and nothing else in the codebase would fail. */
  it("quotes the seller's share the market actually pays", () => {
    const bazaar = streamBySlug("bazaar-sale");
    expect(bazaar?.memberShareBps).toBe(BAZAAR_MEMBER_SHARE_BPS);
    expect(bazaar?.platformShareBps).toBe(MARKET_FEE_BPS);
    expect(bazaar!.memberShareBps + MARKET_FEE_BPS).toBe(10_000);
  });

  it("matches the arithmetic on a real sale, to the cent", () => {
    /* A hundred dollar sale: five to the venue, ninety five to the seller,
       which is what the register promises in basis points. */
    const q = quoteFor(10_000);
    expect(q.feeMinor).toBe(500);
    expect(q.sellerMinor).toBe(9_500);
    expect((q.sellerMinor / q.priceMinor) * 10_000).toBe(BAZAAR_MEMBER_SHARE_BPS);
  });
});
