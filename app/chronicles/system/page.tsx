import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import {
  ChapterFooter,
  ChapterHeader,
  FactRow,
  PullQuote,
  Section,
  StatusBadge,
} from "@/components/chronicles/pieces";

export const metadata: Metadata = {
  title: "The System",
  description:
    "How a Call, a House, the Herald and a Season interlock into one machine: the real scoring math, the anti-farming rules, and the six-title House ladder.",
};

export default function ChroniclesSystemPage() {
  return (
    <article>
      <ChapterHeader
        kicker="Chapter II"
        icon="network"
        title="The System"
        dek="Nothing here is a separate feature bolted beside the others. Every mechanic exists to feed or spend the same standing, and that is the actual design, not a coincidence."
      />

      <div className="mt-10 flex flex-col gap-9">
        <Section id="calls" title="A Call is a claim, not a bet" icon="scrying">
          <p>
            A Call is a public, timestamped claim a member puts their name
            to: a token moves a stated amount by a stated time, a House
            leads the realm, a member reaches a tier. It carries a{" "}
            <strong className="text-bone">category</strong> and a{" "}
            <strong className="text-bone">resolver</strong>, the mechanism
            that decides whether it came true. Two resolvers are shipped:{" "}
            <strong className="text-bone">price</strong>, settled against
            real market data, and <strong className="text-bone">internal</strong>,
            settled from the realm&rsquo;s own tables at zero external cost
            for a claim about the realm itself. Two more,{" "}
            <em>community</em> and <em>manual</em>, are declared in the
            schema and refused at creation rather than accepted and left
            open forever, because a claim nothing can resolve is worse than
            a claim the realm will not accept.
          </p>
          <p>
            Difficulty is not asserted, it is measured. The realm reads the
            token&rsquo;s own trailing realized volatility and freezes a
            baseline probability the instant a member seals the Call:
          </p>
          <Card
            variant="inset"
            radius="md"
            pad="md"
            className="overflow-x-auto"
          >
            <code className="whitespace-pre font-mono text-[13px] leading-relaxed text-bone-mut">
              {"pi_0 = Φ( -ln(1 + k) / (σ √ t) )\n" +
                "S = clamp( 100 · log₂( p / pi_0 ), -100, +100 )"}
            </code>
          </Card>
          <p>
            <code className="text-bone">pi_0</code> is the chance the move
            happens on its own, with no skill involved, so a blue chip
            drifting a fraction of a percent and a fresh token needing a
            forty percent swing are never scored as the same claim. If the
            realm cannot read a real price or measure a real volatility, it
            refuses to seal the Call rather than invent a difficulty. A Call
            sealed against a made-up number would mint permanent Renown out
            of nothing, and permanent means permanent.
          </p>
          <p>
            Once three independent members, never a House-mate, have Called
            the same claim, a peer score replaces the baseline: the crowd
            becomes the difficulty. Anti-farming holds the rest of the line:
            five open Calls at a time, Renown from social actions capped at
            200 a day, and a landing Call&rsquo;s flat award scaled down by
            how easy it actually was.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card variant="inset" radius="md" pad="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                Renown
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                Monotonic. Never falls. Permanent, personal legacy.
              </p>
            </Card>
            <Card variant="inset" radius="md" pad="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
                Season Rating
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                Can fall. Resets each season. Decides the standings while it
                runs.
              </p>
            </Card>
          </div>
        </Section>

        <Section id="houses" title="Houses: a contest of skill, not headcount" icon="council">
          <p>
            Six Houses, Corvane, Emberfall, Frosthold, Stormcrest, Nightvale
            and Goldmane. A House scores the sum of its top twenty
            contributors that season and nothing else, so a House twice the
            size of a rival earns no advantage from the extra names alone.
            Leadership is computed, not elected: with a realm this size, a
            vote of twenty people feels sad, and a title earned by what you
            actually did that season feels immediate. Six titles, one each,
            so six different members carry something real: Lord or Lady,
            Hand of the House, Master of Ravens, Master of War, Chronicler,
            Recruiter.
          </p>
          <p>
            An oath, the act of swearing to a House, is a dated commitment
            with real rules: switching only in the off-season window, one
            season of cooldown before switching again, and contribution
            already made stays with the House that earned it, permanently,
            enforced by the data model rather than a promise. Global Renown
            is personal and travels with you regardless. That is what makes
            backing an underdog House early mean something: leaving does
            not erase what you built, but it does not follow you either.
          </p>
        </Section>

        <Section id="renown" title="Renown, Crests and the Roll of Honour" icon="trophy">
          <p>
            Seven tiers carry a member&rsquo;s Renown from Smallfolk to King
            or Queen. Crests are a second, rarer kind of standing: not NFTs,
            not tokens, never tradable, and never sold, because the entire
            point is that they cannot be bought. Ten are designed; three
            grant automatically today off real thresholds, and the rest sit
            visibly locked rather than hidden, so nobody mistakes a future
            Crest for one that does not exist.
          </p>
          <p>
            The Roll of Honour ranks four real ladders: Accuracy (a shrunk
            mean, so a long honest record beats a lucky streak of three),
            Renown, Glory, and Points. Every number on it is read off the
            same ledger the platform itself settles against, never a
            separate marketing count.
          </p>
        </Section>

        <Section id="herald" title="The Herald" icon="raven">
          <p>
            Tag <code className="text-bone">@raven</code> anywhere in the
            realm and you are talking to the Herald, a real Anthropic model
            reasoning over real context, never a scripted response. It runs
            under iron rules: it never invents a price, a percentage, or a
            statistic, a number it was not handed does not exist to it, and
            it never tells anyone to buy, sell, or hold. An explicit toggle
            grants it live web browsing for the turn, and every reply
            reports plainly whether browsing was used and lists its
            sources. It is the realm&rsquo;s narrator, not its broker.
          </p>
        </Section>

        <Section id="the-rest" title="The rest of the world">
          <p>
            Whispers carries private conversation. The Rookery carries live
            audio courts, joined through a server-signed token so a seat
            can never be forged. The Vault is a non-custodial Privy embedded
            wallet, exportable at any time, and it is what every tip, trade
            and Call settles through. The War is a real-time battle game
            whose champions and Glory are not a separate economy: the daily
            reward flows into the same ledger a House&rsquo;s season
            contribution is derived from. None of this is a second product
            wearing the realm&rsquo;s colours. It is the same standing,
            spent and earned from a different direction.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <StatusBadge status="live" />
            <span className="text-[13px] text-bone-faint">
              Every system named on this page, reachable in the product
              today.
            </span>
          </div>
        </Section>

        <Section id="the-spine" title="One spine underneath all of it">
          <p>
            Every meaningful act in the realm, a Call sealed, a Crest
            earned, a House overtaking a rival, writes one row to a single
            realm event spine. The Ravenry is where those rows surface as
            the feed. This is the architectural decision that keeps the
            system from becoming twenty disconnected features: one act, one
            record, one place it can be seen.
          </p>
          <PullQuote>
            Ravenspire does not need twenty new features. It needs one
            spine, and everywhere the loop touches, that spine is already
            there.
          </PullQuote>
        </Section>

        <Section id="anti-farming" title="What stops it being gamed">
          <div className="flex flex-col">
            <FactRow label="Open Calls at once" value="5" />
            <FactRow
              label="Social Renown, daily cap"
              value="200"
              note="resolved Calls uncapped"
            />
            <FactRow
              label="Peer scoring threshold"
              value="3"
              note="independent members, same claim"
            />
            <FactRow
              label="Confidence band"
              value="55 to 99%"
              note="out of band is refused, never clamped"
            />
          </div>
          <p>
            A missing confidence defaults to the floor of that band, never
            the middle, so an older or hostile client can never inflate a
            score by omitting a field. House-mates are excluded from each
            other&rsquo;s peer baseline, so a House cannot vote its own
            difficulty down.
          </p>
        </Section>
      </div>

      <ChapterFooter
        prev={{ href: "/chronicles", title: "The Realm" }}
        next={{ href: "/chronicles/philosophy", title: "The Principles" }}
      />
    </article>
  );
}
