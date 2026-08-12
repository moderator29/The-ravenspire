"use client";

import Link from "next/link";
import { motion, MotionConfig, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { RavenMark } from "@/components/brand/raven-mark";
import { CrestRoundel, crests } from "@/components/brand/crests";
import { Icon3D } from "@/components/ui/icon-3d";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LandingIcon } from "@/components/landing/icons";
import { comingSoonNav } from "@/lib/nav";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { LandingNav } from "@/components/landing/landing-nav";
import { RealmIntro } from "@/components/landing/realm-intro";
import { NonCustodial } from "@/components/landing/non-custodial";
import { PlatformPreview } from "@/components/landing/platform-preview";
import { TheChampions } from "@/components/landing/the-champions";
import { TheCollection } from "@/components/landing/the-collection";
import { TheGames } from "@/components/landing/the-games";
import { MeetRaven } from "@/components/landing/meet-raven";
import { TheTools } from "@/components/landing/the-tools";
import { ComingSoonTeasers } from "@/components/landing/coming-soon-teasers";
import { Tokenomics } from "@/components/landing/tokenomics";
import { Roadmap } from "@/components/landing/roadmap";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatsStrip } from "@/components/landing/stats-strip";
import { LiveRealmStats } from "@/components/landing/live-realm-stats";
import { SiteFooter } from "@/components/landing/site-footer";
import { RefCapture } from "@/components/referral/ref-capture";

/* Every chip is a live destination in lib/nav.ts. Claim the Throne held a slot
   here while being a coming soon page, and Calls, the flagship, held none. */
const chips = [
  { label: "The Ravenry", href: "/home" },
  { label: "Calls", href: "/calls" },
  { label: "Houses", href: "/houses" },
  { label: "The War", href: "/war" },
  { label: "The Reliquary", href: "/reliquary" },
  { label: "Ask @raven", href: "/raven" },
];

/* Fixed positions for the ten drifting crests (percent based, no randomness).

   Every spot is out in the gutters now. Four of them used to sit inside the
   reading column: 44% is the dead centre of the hero, and the one at 55%/30%
   landed behind the introduction's body copy, so at 1440 a hard edged circle
   with a legible eye inside it sat alone under the call to action and at 390 a
   second one crossed the corner of the Mission card. Atmosphere belongs to the
   background and legibility to the foreground, and a motif with an outline and
   a glyph in it stops being atmosphere the moment it lands on a sentence. */
const floatSpots = [
  { top: "8%", left: "4%", size: 72, delay: 0 },
  { top: "18%", left: "84%", size: 88, delay: 2 },
  { top: "40%", left: "3%", size: 60, delay: 4 },
  { top: "62%", left: "86%", size: 66, delay: 1 },
  { top: "76%", left: "6%", size: 84, delay: 3 },
  { top: "6%", left: "76%", size: 52, delay: 5 },
  { top: "84%", left: "80%", size: 58, delay: 2.5 },
  { top: "30%", left: "88%", size: 54, delay: 6 },
  { top: "55%", left: "5%", size: 48, delay: 7 },
  { top: "12%", left: "80%", size: 56, delay: 8 },
];

const faqs = [
  {
    q: "What is The Ravenspire?",
    a: "A competitive online realm where communities earn reputation through participation. You post, you argue, you make Calls about what happens next, and the realm keeps the record. Crypto is infrastructure here, community is the product, and reputation is the progression system.",
  },
  {
    q: "Is it non-custodial?",
    a: "Yes. A wallet is created for you the moment you sign up and it is truly yours. Export your keys any time and take them anywhere. We never hold your funds, and every action is signed by you.",
  },
  {
    q: "How do I earn?",
    a: "Real actions earn points: ravens that move the realm, Calls that land, replies people value, courts you host, newcomers you bring who stay. Points and Glory settle on the server against verified events, never on the word of a browser. Balances are shown as points, and they convert to $RSP at the token generation event.",
  },
  {
    q: "What is a Call?",
    a: "A public, timestamped claim you put your name to. The realm measures how hard it is from the token's own volatility and freezes that difficulty when you seal, so an easy Call and a hard one cannot score the same. Settlement is against the exact contract you Called, never a ticker anyone can copy.",
  },
  {
    q: "Does being wrong cost me?",
    a: "Yes, but not from the same pot. Renown is permanent and never falls, so a bad month cannot erase a good year. Season Rating takes the loss and resets when the season does. Nothing you have earned can be taken from you, and a Call still means something.",
  },
  {
    q: "Do I need crypto to play?",
    a: "No. You can sign in, post, join a House, make Calls and play The War without ever touching a token. The wallet waits quietly until you choose to use it.",
  },
  {
    q: "What are Houses?",
    a: "The teams of the realm. Six banners, and a House scores the sum of its top twenty contributors only, so it is a contest of skill rather than headcount. Leadership is computed from what people actually did each season, across six titles, and House Clashes run as forty eight hour windows where only Calls made inside them count.",
  },
  {
    q: "Can I switch House?",
    a: "Only between seasons, and your whole oath history stays public on your Keep. Contribution you have already made stays with the House that earned it, forever. That is what makes backing an underdog early mean something.",
  },
];

export default function Landing() {
  const { authenticated } = useRealmAuth();
  const ctaHref = authenticated ? "/home" : "/signin";
  const ctaLabel = authenticated ? "Enter the Ravenry" : "Enter the Realm";
  const reduce = useReducedMotion();

  /* Gentle parallax drift on the ambient crest field as the page scrolls. */
  const { scrollY } = useScroll();
  const fieldY = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -120]);

  return (
    <MotionConfig reducedMotion="user">
      <main className="realm-bg relative min-h-screen overflow-hidden">
        {/* Persist ?ref=CODE share links for onboarding credit. Renders nothing. */}
        <RefCapture />

        {/* Sticky premium navigation */}
        <LandingNav ctaHref={ctaHref} ctaLabel={ctaLabel} />

        {/* Aurora crest field.

            Desktop only, and the reason is that a phone has no gutters. Moving
            the spots out to the margins keeps them clear of the reading column
            at 1024 and above, where the column is capped at 1024px inside a
            wider page. At 390 the column is the page: there is nowhere for a
            drifting motif to sit that is not on top of a sentence, and the one
            at 80% still landed across "CRYPTO BENEATH IT". The atmosphere
            budget is two effects per viewport and a phone already spends both
            on the parchment grid and the hero's aura. */}
        <motion.div
          className="pointer-events-none absolute inset-0 hidden md:block"
          aria-hidden="true"
          style={{ y: fieldY }}
        >
          {floatSpots.map((s, i) => (
            <div
              key={i}
              /* 25, not 40. At forty percent a dimmed crest roundel still
                 reads as a piece of interface someone forgot to remove rather
                 than as light behind the page. */
              className="aurora-item absolute opacity-25"
              style={{
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s, ${s.delay * 0.7}s`,
              }}
            >
              <CrestRoundel icon={crests[i].icon} dim className="h-full w-full" />
            </div>
          ))}
        </motion.div>

        {/* Hero */}
        <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-24 text-center">
          {/* Warm ember-into-gold aura, restrained */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[36rem] w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(217, 176, 64,0.12), rgba(229,112,42,0.05) 45%, transparent 70%)",
            }}
          />
          <Card
            render={
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
              />
            }
            /* `sm`, not `lg`. A radius rung reads as a capsule whenever it
               reaches half the box height, whatever rung it came off. This
               badge is about 29px tall, so 16px rounded its ends completely
               and the first shape on the landing page was the one shape the
               design rules forbid. The Badge primitive is on `sm` for exactly
               this reason. */
            radius="sm"
            pad="none"
            className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold"
          >
            The realm awakens · Season I
          </Card>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="relative mt-8"
          >
            {/* Slow pulsing gold halo behind the mark */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(217, 176, 64,0.4), transparent 70%)" }}
              animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.92, 1.08, 0.92] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Gentle float on the mark itself */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <RavenMark className="h-20 w-20 sm:h-24 sm:w-24" />
            </motion.div>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            /* At `text-5xl` with 0.12em tracking, "RAVENSPIRE" measured 355px
               of a 390px screen inside a 342px content box, so the second line
               of the wordmark ran to within 15px of both edges and read as
               about to be clipped. The name is the loudest thing on the page
               and it should have air around it, not be jammed against the
               glass. 40px holds the line and the 72px desktop size is
               untouched. */
            className="gold-text mt-6 font-display text-[2.5rem] font-semibold tracking-[0.12em] sm:text-7xl"
          >
            THE RAVENSPIRE
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-5 max-w-xl text-base text-bone-mut sm:text-lg"
          >
            Play the War. Collect the champions. Join a House.{" "}
            <span className="font-semibold text-gold">Own the relics.</span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-4"
          >
            <Button variant="gold" size="lg" render={<Link href={ctaHref} />}>
              {ctaLabel}
              <LandingIcon name="arrowRight" className="h-4 w-4" />
            </Button>
            <Link
              href="/chronicle"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-bone-mut transition hover:text-bone"
            >
              Discover the realm
              <LandingIcon name="arrowUpRight" className="h-4 w-4" />
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.85 }}
            className="mt-10 flex max-w-full flex-wrap items-center justify-center gap-2 px-2"
          >
            {chips.map((c) => (
              <Button
                key={c.label}
                variant="glass"
                size="sm"
                className="text-bone-mut"
                render={<Link href={c.href} />}
              >
                {c.label}
              </Button>
            ))}
          </motion.div>

          <LiveRealmStats className="mt-8" />
        </section>

        {/* Narrative + features */}
        <div className="relative mx-auto max-w-5xl space-y-16 px-4 pb-16 sm:space-y-20 sm:px-6">
          {/* Introduction + Mission / Vision / History */}
          <RealmIntro />

          {/* The realm in numbers */}
          <StatsStrip />

          {/* Features: the medieval surfaces, framed as product features */}
          <section id="features" className="scroll-mt-28 space-y-14">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
                <LandingIcon name="features" className="h-4 w-4" />
                The features
              </span>
              <h2 className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl">
                Everything the realm gives you
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-bone-mut">
                The Ravenry feed, Calls, the Houses, The War, the serious tools
                and the Herald @raven are not the pitch, they are the product.
                Here is what you actually get when you enter.
              </p>
            </div>

            {/* The Tools: horizontal rail */}
            <TheTools />

            {/* Meet @raven, the Herald */}
            <MeetRaven />

            {/* Non-custodial promise: horizontal rail */}
            <NonCustodial />
          </section>

          {/* The Games: Claim the Throne + The War, then the champion rail */}
          <div className="space-y-16">
            <TheGames />
            <TheChampions />
          </div>

          {/* The Collection: the sealed Set One fan and the three pillars.
              Directly after the champions on purpose: the rail introduces the
              heroes, this section says you will own them. */}
          <TheCollection />

          {/* See the realm: premium platform showcase */}
          <PlatformPreview />

          {/* Two forward-looking Coming soon teasers */}
          <ComingSoonTeasers />

          {/* $RSP tokenomics: allocation donut + legend */}
          <Tokenomics />

          {/* The phased roadmap on Ethereum */}
          <Roadmap />

          {/* How the realm works: four plain steps */}
          <HowItWorks />

          {/* The Chapters ahead */}
          <Card
            render={
              <motion.section
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6 }}
              />
            }
            radius="xl"
            pad="none"
            className="p-7 sm:p-9"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
              <LandingIcon name="docs" className="h-4 w-4" />
              The Chapters ahead
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl">
              The map, not a finished castle
            </h2>
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut">
              None of these is built. Each has a page in the realm so you can
              see what is coming, and each is labelled as exactly what it is.
              Intentions, not oaths, and we will say so plainly when they shift.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {comingSoonNav.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-start gap-3 border border-steel-line bg-panel p-4"
                >
                  <Icon3D name={c.icon3d} size="sm" className="shrink-0" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-display text-sm font-semibold text-bone">
                      {c.themed}
                      <span className="rounded-sm border border-gold/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold/70">
                        Soon
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-bone-mut">
                      {c.blurb}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* The crests you can earn */}
          <Card
            render={
              <motion.section
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6 }}
              />
            }
            radius="xl"
            pad="none"
            className="p-7 text-center sm:p-9"
          >
            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
              <LandingIcon name="badge" className="h-4 w-4" />
              Earned, never bought
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl">
              Ten crests to prove your standing
            </h2>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              {crests.map((c) => (
                <span key={c.slug} title={`${c.name}: ${c.plain}`}>
                  <CrestRoundel
                    icon={c.icon}
                    dim={c.status === "locked"}
                    className="h-12 w-12"
                  />
                </span>
              ))}
            </div>
            <p className="mx-auto mt-5 max-w-md text-sm text-bone-mut">
              Three live at launch, seven on the roadmap. No collectibles, no
              purchase, no shortcut. You earn them by showing up and being good.
            </p>
          </Card>

          {/* The realm answers - FAQ */}
          <Card
            render={
              <motion.section
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6 }}
              />
            }
            radius="xl"
            pad="none"
            className="p-7 sm:p-9"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
              <LandingIcon name="docs" className="h-4 w-4" />
              The realm answers
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl">
              Questions before you enter
            </h2>
            <div className="mt-6 flex flex-col gap-3">
              {faqs.map((f) => (
                <details
                  key={f.q}
                  className="group border border-steel-line bg-panel px-4 py-3.5 [&_summary]:list-none"
                >
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                    <span className="font-display text-sm font-semibold text-bone">
                      {f.q}
                    </span>
                    <LandingIcon
                      name="plus"
                      className="h-4 w-4 shrink-0 text-gold transition-transform duration-200 group-open:rotate-45"
                    />
                  </summary>
                  <p className="mt-3 text-[13px] leading-relaxed text-bone-mut">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </Card>

          {/* Final CTA */}
          <Card
            render={
              <motion.section
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6 }}
              />
            }
            radius="xl"
            pad="none"
            className="relative overflow-hidden p-9 text-center"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse 50% 100% at 50% 0%, rgba(217, 176, 64,0.16), transparent 70%)",
              }}
            />
            <RavenMark className="relative mx-auto h-12 w-12" />
            <h2 className="gold-text relative mt-4 font-display text-3xl font-semibold">
              The gates are open
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-bone-mut">
              A non-custodial wallet is created for you the moment you enter. No
              keys held, no seats sold, nothing bought that must be earned.
            </p>
            <Button
              variant="gold"
              size="lg"
              className="mt-6"
              render={<Link href={ctaHref} />}
            >
              {ctaLabel}
              <LandingIcon name="arrowRight" className="h-4 w-4" />
            </Button>
          </Card>

          {/* Risk and legal disclaimer band */}
          <Card
            render={
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6 }}
              />
            }
            radius="lg"
            pad="none"
            variant="raised"
            className="p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
              <LandingIcon name="shield" className="h-4 w-4 text-gold" />
              A word before you ride
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-bone-faint">
              The Ravenspire is a fun-first social platform. $RSP is a utility and
              social token that powers the realm, not an investment. Nothing here
              is financial advice, and no one at The Ravenspire will ever tell you to
              buy, sell, or hold. Presale coming soon, and details will be
              announced in the open when it is ready.
              Crypto carries real risk, including the loss of everything you put
              in, so bring only what you can afford to lose. The realm is
              non-custodial by design: you hold your own keys, they are always
              exportable, and we never take custody of your funds. Read the{" "}
              <Link href="/legal/terms" className="text-bone-mut underline decoration-gold/40 underline-offset-2 transition hover:text-bone">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-bone-mut underline decoration-gold/40 underline-offset-2 transition hover:text-bone">
                Privacy Policy
              </Link>{" "}
              before you enter.
            </p>
          </Card>

          <SiteFooter />
        </div>
      </main>
    </MotionConfig>
  );
}
