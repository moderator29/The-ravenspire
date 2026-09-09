import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import {
  ChapterFooter,
  ChapterHeader,
  FactRow,
  Section,
  StatusBadge,
} from "@/components/chronicles/pieces";

export const metadata: Metadata = {
  title: "The Economy",
  description:
    "How $RSP is meant to be earned before it is meant to be traded: Season Zero, the founding round, and a business model sequenced commerce first, fees second, token utility last.",
};

export default function ChroniclesEconomyPage() {
  return (
    <article>
      <ChapterHeader
        kicker="Chapter IV"
        icon="coins"
        title="The Economy"
        dek="What earning actually converts to, in what order the realm intends to make a living, and exactly which parts of that are running today versus still ahead."
      />

      <div className="mt-10 flex flex-col gap-9">
        <Section id="points-and-rsp" title="Points first, $RSP at the end of it" icon="coins">
          <p>
            Real actions earn points on the server, against verified events,
            never on the word of a browser: a raven that moves the realm, a
            Call that lands, a court you host, a member you bring in who
            stays. Balances display as{" "}
            <strong className="text-bone">POINTS</strong> today, on
            purpose: a figure that has not converted to a token yet should
            never be shown as though it already had a price. Points convert
            to $RSP at the token generation event.
          </p>
          <div className="flex flex-col">
            <FactRow label="Ticker" value="$RSP" />
            <FactRow label="Total supply" value="1,000,000,000" note="fixed" />
            <FactRow
              label="Launch model"
              value="Fixed supply"
              note="no mint after launch"
            />
          </div>
        </Section>

        <Section id="season-zero" title="Season Zero, the founding round" icon="chest">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex shrink-0 items-center rounded-sm border border-steel-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
              Archived
            </span>
            <span className="text-[13px] text-bone-faint">
              Built and shipped. Not currently accepting contributions.
            </span>
          </div>
          <p>
            Season Zero is the realm&rsquo;s founding round, built to run
            inside the platform itself rather than on a third-party
            launchpad. It is not open today. When it runs, its terms are
            fixed and public rather than negotiated per member:
          </p>
          <div className="flex flex-col">
            <FactRow label="Offered" value="7% of supply" note="70,000,000 $RSP" />
            <FactRow label="Rate" value="4,666,666 $RSP" note="per 1 ETH, fixed" />
            <FactRow label="Softcap" value="6 ETH" note="below it, every contribution refunds" />
            <FactRow label="Hardcap" value="15 ETH" note="reaching it closes the round early" />
          </div>
          <p>
            Non-custodial and wallet to wallet: a contribution moves ETH
            directly to the treasury and the server verifies it on chain,
            so the raise total is a chain-verified sum anyone can audit
            rather than a number the realm simply asserts. Reaching the
            hardcap early closes the round; falling short of the softcap
            refunds every contribution to the wallet that sent it. Tokens
            deliver at the token generation event. Any later sale phase
            will be announced before it runs, and never described as open
            unless it genuinely is.
          </p>
        </Section>

        <Section id="business-model" title="Commerce first, fees second, token utility last">
          <p>
            The sequencing is deliberate and it is the actual pitch: revenue
            paths that work with no token at all, before fees, before any
            token utility is asked to carry the business.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            <Card variant="inset" radius="md" pad="md">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-sm font-semibold text-bone">
                  The Collection
                </p>
                <StatusBadge status="building" />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                Champion card packs with published odds and provably fair,
                re-verifiable openings, plus physical merchandise through
                print on demand. Non-custodial crypto checkout is built and
                real; the storefront stays sealed until pricing is
                confirmed, so nothing is offered for sale before its terms
                are final.
              </p>
            </Card>
            <Card variant="inset" radius="md" pad="md">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-sm font-semibold text-bone">
                  Marketplace fees
                </p>
                <StatusBadge status="vision" />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                A native secondary market for cards, member to member,
                signed by their own wallets, with a protocol fee. Real
                print caps are what make a real floor possible.
              </p>
            </Card>
            <Card variant="inset" radius="md" pad="md">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-sm font-semibold text-bone">
                  $RSP utility
                </p>
                <StatusBadge status="vision" />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                Staking, entries and real sinks inside the realm, sequenced
                after the product already works without them. A token
                asked to carry a business on its own is usually a sign the
                business does not have one yet.
              </p>
            </Card>
          </div>
        </Section>

        <Section id="the-honest-line" title="The honest line on all of it">
          <p>
            Nothing on this page is financial advice, and no figure on it is
            a promise of value. $RSP is a utility and social token intended
            for use inside the realm, standing here is earned through
            participation and never bought, and a purchased Season Zero
            allocation confers no rank, no title, and no Crest. Crypto
            carries real risk, including the total loss of what you put in.
            Full terms live in the{" "}
            <a
              href="/legal/terms"
              className="font-medium text-gold underline decoration-gold/40 underline-offset-2 transition hover:text-gold-bright"
            >
              Terms of Service
            </a>
            .
          </p>
        </Section>
      </div>

      <ChapterFooter
        prev={{ href: "/chronicles/philosophy", title: "The Principles" }}
        next={{ href: "/chronicles/roadmap", title: "The Road Ahead" }}
      />
    </article>
  );
}
