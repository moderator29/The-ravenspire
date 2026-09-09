import type { Metadata } from "next";
import {
  ChapterFooter,
  ChapterHeader,
  PullQuote,
  Section,
} from "@/components/chronicles/pieces";

export const metadata: Metadata = {
  title: "The Principles",
  description:
    "Why The Ravenspire is non-custodial, real data only, and server-authoritative by rule rather than by promise, and what that actually buys a member.",
};

export default function ChroniclesPhilosophyPage() {
  return (
    <article>
      <ChapterHeader
        kicker="Chapter III"
        icon="scales"
        title="The Principles"
        dek="Four rules the realm holds itself to, enforced in the code rather than stated in a pitch. Every one of them exists because the alternative was tried elsewhere and it failed the people it was supposed to serve."
      />

      <div className="mt-10 flex flex-col gap-9">
        <Section id="non-custodial" title="Non-custodial is a trust wedge, not a limitation" icon="vault">
          <p>
            A wallet is created for you the moment you arrive, through a
            Privy embedded wallet, and it is genuinely yours: exportable at
            any time, to any wallet you choose. The realm never holds your
            keys and never takes custody of your funds. Every transfer,
            every tip, every trade, is signed by you.
          </p>
          <p>
            The honest reading of this is not restraint, it is leverage.{" "}
            <strong className="text-bone">
              We cannot lose your money because we never touch it.
            </strong>{" "}
            That sentence is not a disclaimer. It is the reason a member can
            trust the realm with a real position without trusting a company
            they have never met, and it is the single hardest thing for a
            custodial competitor to say honestly.
          </p>
        </Section>

        <Section id="real-data" title="Real data, or an honest empty state" icon="scrying">
          <p>
            No mock numbers, no seeded activity, no invented traction,
            anywhere, ever. A chart with nothing to show shows nothing,
            plainly, rather than a placeholder shaped like data. A Call the
            realm cannot measure a real difficulty for is refused rather
            than sealed against a guess. This rule costs real product
            polish in the short term: an empty leaderboard looks worse than
            a fake one. It is the whole reason the numbers this realm does
            show can be trusted at all.
          </p>
          <p>
            The same discipline applies to the Herald. Every answer is a
            real model call over real, cited context, and it is built to
            say it does not know rather than invent a figure that sounds
            plausible. An AI that occasionally makes up a price is worse
            than no AI, because the member has no way to tell which answer
            was the invented one.
          </p>
        </Section>

        <Section id="server-authoritative" title="Server-authoritative, because a leaderboard the client can edit is not a leaderboard" icon="guard">
          <p>
            Points, Glory and every settlement price resolve on the server
            against verified events. A client can display a number; it can
            never mint one. This matters more here than in most products,
            because Renown is the actual game: a competitive standing that
            a browser console could inflate is not a game anyone should
            play for very long, and this realm is built to still be worth
            playing in its tenth season, not just its first week.
          </p>
        </Section>

        <Section id="earned" title="Earned, never bought" icon="trophy">
          <p>
            Renown cannot be purchased, transferred, or gifted. Crests have
            no shop. A Season Zero allocation, when the round is open, buys
            $RSP, and it buys nothing about your standing in the realm: a
            purchased token balance confers no rank, no title, and no
            Crest. The two systems, what you own and what you have
            earned, are kept deliberately separate, because the moment they
            blur, standing stops meaning anything to the people who worked
            for it.
          </p>
        </Section>

        <Section id="a-world" title="A world, not a feed">
          <p>
            Most of what calls itself SocialFi is a leaderboard with a
            token bolted on: strip away the number and there is nothing
            left to belong to. The Ravenspire is built the other direction.
            Six Houses with their own colours and standings, an oath
            history that stays on your Keep for good, Crests struck rather
            than minted, a realm lexicon that gives the same handful of
            ideas the same names everywhere you meet them. None of that is
            decoration on top of the mechanics. It is the identity system
            that makes leaving the realm actually cost something, which is
            the same thing as saying it is the reason staying means
            something.
          </p>
          <PullQuote>
            Features can be copied. A world cannot.
          </PullQuote>
          <p>
            A rival can ship Calls, Houses, and a Herald of their own in a
            season. What they cannot ship on the same timeline is a
            community with real history in it, because history is the one
            input that only comes from time actually passing while the
            rules held.
          </p>
        </Section>
      </div>

      <ChapterFooter
        prev={{ href: "/chronicles/system", title: "The System" }}
        next={{ href: "/chronicles/economy", title: "The Economy" }}
      />
    </article>
  );
}
