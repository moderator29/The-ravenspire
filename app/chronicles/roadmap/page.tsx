import type { Metadata } from "next";
import {
  ChapterFooter,
  ChapterHeader,
  FactRow,
  PullQuote,
  Section,
  StatusBadge,
} from "@/components/chronicles/pieces";

export const metadata: Metadata = {
  title: "The Road Ahead",
  description:
    "What is shipped and reachable today, what is being built with the gap stated plainly, and where The Ravenspire could realistically go over the next several years.",
};

export default function ChroniclesRoadmapPage() {
  return (
    <article>
      <ChapterHeader
        kicker="Chapter V"
        icon="compass"
        title="The Road Ahead"
        dek="A map, not a finished castle. Everything below is labelled exactly what it is, and the label changes the day the fact does, not before."
      />

      <div className="mt-10 flex flex-col gap-9">
        <Section id="built" title="What is built">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status="live" />
            <span className="text-[13px] text-bone-faint">
              Reachable in the product right now.
            </span>
          </div>
          <p>
            The Ravenry, Calls, Houses, Renown, Crests, the Roll of Honour,
            Whispers, the Rookery, the Herald, the Vault, the War, and the
            full suite of portfolio and safety tools underneath are shipped
            and running against real data, not a demo build. So is the
            realm event spine that ties them together.
          </p>
          <div className="flex flex-col">
            <FactRow label="Pages and surfaces" value="80+" />
            <FactRow label="API routes" value="125+" note="server-authoritative" />
            <FactRow label="Database migrations" value="65+" />
            <FactRow label="Automated tests" value="900+" note="green in CI" />
          </div>
          <p>
            None of that is a promise checked by hand. Eighteen house rules,
            real data only, non-custodial only, server-authoritative
            rewards, the writing and brand constraints on this very page,
            run as automatic checks against every single commit. A rule a
            reviewer has to remember gets forgotten eventually. A rule the
            build enforces does not.
          </p>
        </Section>

        <Section id="building" title="What is being built">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status="building" />
            <span className="text-[13px] text-bone-faint">
              Real, in progress, with the gap stated rather than hidden.
            </span>
          </div>
          <p>
            The Forge, a staking hall, is built with its terms live on the
            page, gated behind a feature flag until the on-chain contract
            wiring is finished; there is nothing to sign yet, so nothing is
            offered as though there were. The Collection&rsquo;s storefront
            is built and sealed until pricing is confirmed. Delivery beyond
            in-app notifications, email and other channels, is declared but
            not yet wired. Renown does not unlock capabilities today; a
            tier is a title, and a ladder of real privileges tied to it is
            designed and not built.
          </p>
        </Section>

        <Section id="deliberately-not-yet" title="What was priced and deliberately deferred">
          <p>
            Not every gap on this page is an oversight. A Call&rsquo;s
            category schema already reserves esports, gaming, culture and
            sport alongside markets and the realm itself, and two further
            resolvers, community voting and manual admin resolution, are
            declared in the data model. Building either honestly, in a way
            that cannot be gamed, was priced against its cost and
            deliberately deferred rather than shipped as a token category
            with no real resolver behind it. A claim tagged Esports that
            still settles on a coin ticker is not an esports claim. We
            would rather a category sit reserved and honest than ship it
            half true.
          </p>
        </Section>

        <Section id="vision" title="Where this goes">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge status="vision" />
            <span className="text-[13px] text-bone-faint">
              Designed direction, not a dated commitment.
            </span>
          </div>
          <p>
            The near path is the one the business model already states
            plainly: the Collection opens once its pricing is confirmed, a
            native marketplace follows it with a real secondary market for
            cards members already own, and $RSP utility, staking, entries,
            real sinks, comes after the product has already proven it
            works without needing a token to carry it.
          </p>
          <p>
            The further path is where the realm gets to be more than a
            better Calls product. A House with a real level ladder and
            real unlocks behind it, not a number that only climbs. A Roll
            of Honour with genuine seasons of history behind it instead of
            one. Community-resolved claims once a fair, ungameable
            mechanism exists to run them, at which point esports, culture
            and sport stop being reserved labels and become real
            categories. None of this is promised on a date. It is the
            direction every shipped system already points.
          </p>
          <PullQuote>
            We are not pretending Ravenspire is already everything it will
            become. We are showing you what exists, and building toward
            what a world like this one is actually for.
          </PullQuote>
        </Section>

        <Section id="how-its-built" title="How it gets built">
          <p>
            The realm is built by a small team leveraging AI-assisted
            engineering with unusually strict discipline layered on top of
            it: the highest-risk logic, scoring, points, payments, carries
            the heaviest test coverage, and an adversarial security review
            closed the money-path exploits it found before this document
            was written. That combination, a small team moving at funded-
            team speed without lowering the bar, is the actual bet: not
            that the realm will hire its way to quality, but that it
            already builds that way.
          </p>
        </Section>
      </div>

      <ChapterFooter
        prev={{ href: "/chronicles/economy", title: "The Economy" }}
      />
    </article>
  );
}
