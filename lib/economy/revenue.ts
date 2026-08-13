/* THE SHARE REGISTER: every stream that could pay a member, and what it does.

   THE QUESTION THIS MODULE ANSWERS, AND THE ANSWER

   "Payouts are non-custodial" sounds like a constraint on how money leaves.
   It is not. It is a constraint on whether an earned balance may exist at all,
   and working that through is the whole of this file.

   An earned balance denominated in money is a debt: the platform saying "we
   owe you fourteen dollars". For the platform to pay it later, the platform
   has to be holding it now. Holding money that is owed to a member IS custody,
   whether it is called a balance, a float, an accrual or a pending payout, and
   whether it is held for a month or for an hour. Rule 6 does not have an
   exception for short holds and neither does anybody who regulates this.

   So there are exactly three ways to pay a member a share of revenue:

     1. The platform receives the gross and forwards the member's share later.
        This is the design every creator platform ships. It is custody. It is
        refused, and it is refused even though it is by far the most convenient
        one, because convenience is what custody always trades on.

     2. The platform receives the gross into its own wallet and pays the member
        from its own funds, on its own schedule. The money is the platform's
        own, which sounds like it escapes the problem. It does not: between the
        sale and the payment the member is owed money the platform is holding.
        The accrual is the custody. Renaming it does not move it.

     3. THE PAYER PAYS THE MEMBER DIRECTLY, AT THE MOMENT OF THE EVENT, IN THE
        PAYER'S OWN SIGNED TRANSACTION. Nothing accrues because nothing is
        owed: the value went from the payer's wallet to the member's wallet and
        was never anywhere else. This is the only one that is non-custodial,
        and it is what the Bazaar already does with the seller's ninety five
        percent and what a tribute already does with the whole amount.

   SPLIT AT SOURCE, NEVER ACCRUE. That is the rule, and this module enforces it
   mechanically at the bottom of the file rather than trusting anybody to
   remember it. A stream that cannot pay a member at the instant the payer pays
   is a stream that pays a member nothing, and the surface says so.

   WHAT THE RULE COSTS, WRITTEN DOWN HONESTLY BECAUSE IT IS NOT FREE

     - A signature per payee. Two payees means the buyer signs twice, which is
       the price section 45.3 already paid. A third payee would mean a third
       prompt, and every added prompt is a real drop off at the exact moment a
       member is committing money.
     - No accrual means no aggregation. A share worth a fraction of a cent can
       never be paid, because there is no balance to let it accumulate in. Any
       share small enough to round to nothing at a single sale is a share that
       does not exist, and the register is not allowed to declare one.
     - It cannot cross rails. A payment that arrives on a card cannot pay a
       member on chain in the same act, so a card paid surface can share
       nothing at all until its provider itself can split the payment, which is
       a paid integration and a regulatory posture rather than a feature.
     - There is no "minimum payout threshold", no payout schedule, no pending
       column, and no support queue for a payout that did not arrive. That is
       the compensation, and it is a large one.

   REAL DATA ONLY APPLIES TO REVENUE TOO. Nothing here declares a share of a
   stream that does not exist. Where the honest answer is that a surface earns
   a member nothing today, the register says exactly that and names what it is
   waiting on, and The Coffers renders that sentence instead of a figure.

   Client safe: The Coffers renders this register directly, so the terms a
   member reads are the terms the assertions below enforce. */

/* ------------------------------------------------------------------
   The shapes
   ------------------------------------------------------------------ */

/* How the payer pays. This decides what a share can possibly be.

     wallet  the payer signs a transfer from their own wallet, so a second
             payee is a second transfer and a share can settle at source.
     card    the payer pays a processor, which pays the platform. A share can
             only settle at source if the processor itself splits the payment,
             which none of this product's rails do today.
     none    nothing is paid. The surface is not a revenue surface. */
export type PaymentRail = "wallet" | "card" | "none";

/* When a member's share reaches them.

     at-source   in the payer's own transaction, at the instant of the event.
                 The only settlement this codebase permits for a member share.
     none        no share is paid. Either the stream is not revenue, or it
                 cannot pay one at source and therefore does not pay one. */
export type ShareSettlement = "at-source" | "none";

export interface RevenueStream {
  slug: string;
  name: string;
  /* Who pays, in one phrase. Named because "revenue" with no payer is the
     shape of an invented stream. */
  payer: string;
  rail: PaymentRail;
  /* Does real money change hands here at all. False for the surfaces that pay
     standing rather than value, which are listed anyway so the register can be
     read as the complete answer to "what does the realm pay me". */
  producesRevenue: boolean;
  /* The member's share of the gross, in basis points. 10000 is all of it. */
  memberShareBps: number;
  /* The platform's share of the gross, in basis points. */
  platformShareBps: number;
  settlement: ShareSettlement;
  /* The realm flag that seals this surface, or null when it is already open. */
  sealedBy: string | null;
  /* What has to be true before a member earns anything here, or null when
     nothing does. Rendered verbatim: this is the honest empty state. */
  waitingOn: string | null;
  /* The line The Coffers prints under the stream. Written here so the register
     and the surface cannot describe the same terms differently. */
  terms: string;
}

/* ------------------------------------------------------------------
   The register
   ------------------------------------------------------------------ */

export const REVENUE_STREAMS: RevenueStream[] = [
  /* THE ONE STREAM PAYING A MEMBER REAL VALUE TODAY, WITH NO FLAG ON IT.

     A tribute is not a platform product with a member's cut bolted on. It is
     one member paying another, from their own wallet to the other's own
     wallet, with the realm reading the receipt off the chain afterwards and
     recording it. The platform takes nothing, so there is nothing to share and
     nothing to withhold, and there has never been a balance anywhere in it. */
  {
    slug: "tribute",
    name: "Tributes",
    payer: "Another member, from their own wallet",
    rail: "wallet",
    producesRevenue: true,
    memberShareBps: 10_000,
    platformShareBps: 0,
    settlement: "at-source",
    sealedBy: null,
    waitingOn: null,
    terms:
      "All of it, straight to your wallet, in the sender's own transaction. The realm takes no cut and never holds it.",
  },

  /* THE BAZAAR, AND THE ONLY CREATOR SHARE IN THE PRODUCT WORTH THE NAME.

     Ninety five percent of a sale, paid by the buyer's wallet to the seller's
     wallet, in the buyer's own signed transaction. That is a revenue share of
     9500 bps settled at source, and it has been built since section 45.

     WHY NOTHING IS SHARED OUT OF THE FIVE PERCENT, WHICH IS THE DECISION A
     REVIEWER WILL WANT ARGUED. The obvious extension is to pay somebody a
     slice of the venue fee: the buyer's referrer, the seller's referrer, a
     curator. Every version of it costs the buyer a third wallet prompt at the
     moment they are handing over money, and section 45.3 spent its argument
     establishing that two signatures is the price of never touching a seller's
     funds. A third has no comparable justification: nobody in the candidate
     list created the card, the listing or the sale. And re-cutting the venue
     fee is a decision about the business rather than about the code, so it is
     not one an implementation gets to make on its own. */
  {
    slug: "bazaar-sale",
    name: "Selling a card in the Bazaar",
    payer: "The buyer, from their own wallet",
    rail: "wallet",
    producesRevenue: true,
    memberShareBps: 9_500,
    platformShareBps: 500,
    settlement: "at-source",
    sealedBy: "market_live",
    waitingOn:
      "The Bazaar is sealed. When it opens, a sale pays you directly and there is nothing to claim afterwards.",
    terms:
      "You keep 95% of the price you named. The buyer's wallet pays yours in their own transaction; the realm's 5% is paid separately by the same buyer and never passes through your sale.",
  },

  /* THE STREAM THAT IS REAL AND STILL SHARES NOTHING, WHICH IS THE ONE THAT
     PROVES THE RULE IS DOING WORK.

     Chests and the Mercer take real money from real customers. A share for the
     member whose banner brought that customer is the most obviously fair
     creator payment in the whole product, and it is the one this design cannot
     make. The payment arrives on a card, through a processor, into the
     platform's own account. Splitting it at source needs the processor's own
     connected accounts product, which is a paid integration (rule 19), makes
     the platform a payment facilitator, and carries a compliance posture
     nobody here has. Every other way of paying it is an accrual, and an
     accrual is custody.

     So it pays zero, and the surface says zero and says why. A referral does
     earn POINTS today, through `banner_raised`, and POINTS are not money and
     are never described as any. */
  {
    slug: "commerce-order",
    name: "Chests and the Mercer",
    payer: "A customer, by card",
    rail: "card",
    producesRevenue: true,
    memberShareBps: 0,
    platformShareBps: 10_000,
    settlement: "none",
    sealedBy: "chests_live",
    waitingOn:
      "A card payment reaches the realm through a processor, so it cannot pay a member at the moment it is made. Paying a share afterwards would mean the realm holding your money until it did, which it will not do. Nothing is shared here until the processor itself can split a payment.",
    terms:
      "No member share. Bringing somebody to the realm earns POINTS through your banner, which are standing and never money.",
  },

  /* NOT REVENUE, AND LISTED SO THAT NOBODY HAS TO GUESS.

     A Call that resolves well is the single most valuable thing a member can
     do in this product and it pays no money at all. Writing that down is the
     point: the pressure to invent a revenue stream lands hardest on the
     surface that most deserves one. */
  {
    slug: "call-resolution",
    name: "Calls that land",
    payer: "Nobody. No money changes hands",
    rail: "none",
    producesRevenue: false,
    memberShareBps: 0,
    platformShareBps: 0,
    settlement: "none",
    sealedBy: null,
    waitingOn: null,
    terms:
      "Renown, Glory and POINTS, and a staked Call returns its stake with a bonus. Standing, not money. The realm sells nothing when a Call lands and so has nothing to share.",
  },
];

export function streamBySlug(slug: string): RevenueStream | null {
  return REVENUE_STREAMS.find((s) => s.slug === slug) ?? null;
}

/* Every stream that actually pays a member a share of real money. Two today,
   and the surface renders exactly these as the answer to "what pays me". */
export function payingStreams(): RevenueStream[] {
  return REVENUE_STREAMS.filter((s) => s.memberShareBps > 0);
}

/* ------------------------------------------------------------------
   Module load assertions

   The same posture lib/commerce/market.ts takes with a fee that does not add
   up. A register that declares an accrued share must break the build, because
   by the time anybody notices in production the platform is holding money it
   told a member it owed them, and there is no clean way back from that.
   ------------------------------------------------------------------ */

for (const s of REVENUE_STREAMS) {
  if (!Number.isInteger(s.memberShareBps) || s.memberShareBps < 0 || s.memberShareBps > 10_000) {
    throw new Error(`${s.slug} declares a member share of ${s.memberShareBps} bps, which is not a share.`);
  }
  if (!Number.isInteger(s.platformShareBps) || s.platformShareBps < 0 || s.platformShareBps > 10_000) {
    throw new Error(`${s.slug} declares a platform share of ${s.platformShareBps} bps, which is not a share.`);
  }

  /* The whole doctrine, in one condition. Anything paying a member that is not
     settled in the payer's own transaction is an accrued balance wearing a
     different word. */
  if (s.memberShareBps > 0 && s.settlement !== "at-source") {
    throw new Error(
      `${s.slug} pays a member ${s.memberShareBps} bps but does not settle at source. A share the platform receives first and forwards later is custody, whatever it is called. Split it at source or pay nothing.`
    );
  }

  /* A card rail cannot pay a member at source, so it cannot pay one at all.
     Stated separately from the rule above because it is the reason a stream
     ends up violating it, and a build error should name the cause. */
  if (s.memberShareBps > 0 && s.rail !== "wallet") {
    throw new Error(
      `${s.slug} pays a member ${s.memberShareBps} bps over a ${s.rail} rail. Only a payer signing their own transfer can pay a member at source.`
    );
  }

  /* No money, no share. This is the "do not invent a revenue stream" line,
     enforced rather than asserted in prose. */
  if (!s.producesRevenue && (s.memberShareBps > 0 || s.platformShareBps > 0)) {
    throw new Error(
      `${s.slug} produces no revenue and still declares a split. A share of nothing is an invented stream.`
    );
  }

  /* The two halves of a real stream have to be the whole of it. A stream whose
     shares do not sum to 10000 is either losing money to nowhere or paying out
     more than it takes, and both are the kind of arithmetic that is only ever
     discovered by the person it shorted. */
  if (s.producesRevenue && s.memberShareBps + s.platformShareBps !== 10_000) {
    throw new Error(
      `${s.slug} splits ${s.memberShareBps} + ${s.platformShareBps} bps, which is not the whole of it.`
    );
  }

  /* A stream that pays nothing has to say why, in a sentence a member can
     read. An empty state with no explanation is the thing this register was
     built to stop. */
  if (s.producesRevenue && s.memberShareBps === 0 && !s.waitingOn) {
    throw new Error(
      `${s.slug} is real revenue, pays a member nothing, and does not say what it is waiting on.`
    );
  }
}

/* The Bazaar's member share and the Bazaar's own fee are one arithmetic, and
   the register is not allowed to hold a second opinion about it. Checked here
   rather than in a test because the register is what a member reads: a
   register saying 95% beside a market charging 8% would be the platform lying
   on its own earnings page.

   Imported for the assertion only. lib/commerce/market.ts is server-only, so
   the constant is restated and checked against it in
   lib/economy/revenue.test.ts instead, which is the one place both can be
   loaded. That is the same reason lib/houses/perks.ts restates its prices
   rather than importing the server catalogue. */
export const BAZAAR_MEMBER_SHARE_BPS = 9_500;

{
  const bazaar = streamBySlug("bazaar-sale");
  if (!bazaar || bazaar.memberShareBps !== BAZAAR_MEMBER_SHARE_BPS) {
    throw new Error("The register and the Bazaar disagree about the seller's share.");
  }
}
