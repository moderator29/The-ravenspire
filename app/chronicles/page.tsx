import type { Metadata } from "next";
import Link from "next/link";
import {
  ChapterFooter,
  ChapterHeader,
  PullQuote,
  Section,
} from "@/components/chronicles/pieces";

export const metadata: Metadata = {
  title: "The Realm",
  description:
    "The Ravenspire is a competitive realm where a public, timestamped prediction becomes a permanent reputation nobody can buy, borrow, or take back.",
};

export default function ChroniclesOverviewPage() {
  return (
    <article>
      <ChapterHeader
        kicker="Chapter I"
        icon="raven"
        title="The Realm"
        dek="What Ravenspire actually is, in one idea: a public prediction, scored against a token's own real difficulty the instant you seal it, becomes a reputation nobody can buy, borrow, or take back."
      />

      <div className="mt-10 flex flex-col gap-9">
        <Section id="the-idea" title="The idea, in one move">
          <p>
            Most places online that let you predict something pay you in one
            of two currencies. A prediction market pays you money: close the
            position, collect or lose, and nothing about who you are
            changes. A social platform pays you attention: a number goes up,
            an algorithm resets it, and it means nothing the moment you stop
            posting. Neither currency survives you leaving the app.
          </p>
          <p>
            The Ravenspire pays you in a third currency, and it is the one
            the other two skipped: a name. You post a public, timestamped
            claim, called a Call, and the realm measures how hard it was
            from the token&rsquo;s own real trailing volatility before scoring
            you against it. Land it, and Renown accrues. Renown never falls.
            It cannot be bought, borrowed, transferred, or farmed from a
            browser tab, and it is still yours a year from now whether or
            not you ever open the app again this week.
          </p>
          <PullQuote>
            A reputation that can&rsquo;t be bought is the one asset here you
            can never take to the next app, which is exactly why it is worth
            building in the first place.
          </PullQuote>
        </Section>

        <Section id="one-loop" title="One loop, and a world built around it">
          <p>
            Everything in the realm feeds the same five-beat loop. You seal
            a <strong className="text-bone">Call</strong>, a claim about a
            token, a House, or the realm itself. The realm{" "}
            <strong className="text-bone">scores</strong> it against the
            real difficulty frozen at the moment you sealed it, never a
            coin flip dressed up as one, and settles against the exact
            contract you named, never a ticker somebody else can recycle.
            Landing it mints{" "}
            <strong className="text-bone">Renown</strong>, permanent and
            monotonic, and Season Rating, which carries the risk and resets
            with the season. Your standing feeds your{" "}
            <strong className="text-bone">House</strong>, one of six
            banners, scored on its top contributors so a large House cannot
            simply out-headcount a sharp one. And the whole realm runs
            inside <strong className="text-bone">Seasons</strong>, a clock
            that closes, banks the standings that mattered, and opens
            again.
          </p>
          <p>
            Around that loop sits the rest of the world: the Ravenry, the
            realm&rsquo;s own feed and the place all of this actually
            happens; Whispers and the Rookery for the quieter and louder
            ends of talking to people; the Herald, an AI that reads real
            data and never invents a figure; the Vault, a wallet that is
            genuinely yours; and the War, a battle game whose Glory feeds
            straight back into House standing. None of it is bolted on.
            Every piece exists because the loop needed it.
          </p>
          <p className="text-bone-mut">
            Chapter II walks the whole system end to end, including the
            actual scoring math and why it refuses to invent a difficulty
            when it cannot measure one.{" "}
            <Link
              href="/chronicles/system"
              className="font-medium text-gold underline decoration-gold/40 underline-offset-2 transition hover:text-gold-bright"
            >
              Read The System
            </Link>
            .
          </p>
        </Section>

        <Section id="why-different" title="Why this has not already been done">
          <p>
            SocialFi pays members to show up and loses them the day the
            emission slows, because rewards with no identity attached retain
            nobody. Prediction markets proved crypto-native demand for a
            public, timestamped claim, and then monetized it in a way that
            builds nothing once the position closes. Most reputation online
            is bought, botted, or fake, because followers are for sale and
            almost every leaderboard can be gamed from a browser.
          </p>
          <p>
            The Ravenspire sits in the gap those three leave open: identity
            that compounds, built on a mechanic honest enough that a member
            cannot buy their way onto the Roll of Honour. That gap was not
            hiding. It was expensive to build correctly, non-custodial
            wallets only recently became invisible enough to feel like a
            normal app instead of a chore, and a world with real lore takes
            longer to build than a leaderboard with a token bolted on. Doing
            it honestly, at all, is most of the moat.
          </p>
        </Section>

        <Section id="what-exists" title="What is real today, in one sentence">
          <p>
            Every system named on this page is shipped and reachable, not a
            mockup: the Ravenry, Calls, Houses, Renown, Crests, the Herald,
            the Vault, the War, and the tools underneath, all reading real
            data and settling server-side against verified events. Chapter
            V draws the honest line between what is live, what is being
            built with the gap stated plainly, and what is still a
            deliberate, undated intention.
          </p>
        </Section>
      </div>

      <ChapterFooter
        next={{ href: "/chronicles/system", title: "The System" }}
      />
    </article>
  );
}
