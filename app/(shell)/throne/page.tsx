"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { BackButton } from "@/components/shell/back-button";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";

/* Claim the Throne is held back for launch to build anticipation through the
   presale. This is the sneak peek: what the season game will be, framed as a
   premium coming soon reveal. The full game lives in git history and returns
   at the season opening.

   Two registers, and the whole point of this rewrite is that they are now
   visibly separated.

   The hero is Ceremony, which section 2 of the design system names the coming
   soon chapters as, so it takes the Forge register undiluted: the 3D crown at
   `hero`, forged gold on the title, one warm radial behind it, one entrance,
   one action. It is now the same shape as `/soon/[slug]`, which is the
   canonical chapter page and the one this route had drifted away from.

   Everything below it is Ledger. Flat plates, steel tiles, hairline borders,
   no glow and no motion at all. Before this, every one of the seven panels
   under the hero carried a gold bordered icon tile and a gold hairline of its
   own, so the page glowed from top to bottom and the hero read as just another
   card. Ornament is earned, never ambient.

   The motion that is gone was also a correctness bug, and it is worth naming
   because it is invisible in source. Each panel entered on `whileInView` with
   `once: true` and `initial={{ opacity: 0 }}`. Measured on a 390x844 phone,
   after scrolling to the bottom of the page, the first pillar was still at
   `opacity: 0`: it had passed the observer's margin during the scroll without
   ever being reported as intersecting, and `once: true` meant it would never
   be looked at again. A quarter of the section a member came to read was
   permanently invisible, and no static check could have seen it, because the
   class that hid it was doing exactly what it said. */

const PILLARS = [
  {
    icon: "crown",
    title: "Seasons for the Throne",
    body: "Every season is a race for the Iron Throne. Earn Glory across the realm and climb from Smallfolk to King or Queen.",
  },
  {
    icon: "swords",
    title: "Duels of the Circle",
    body: "Challenge any member to a duel of wits and words. The realm votes, the winner takes the Glory, the loser takes the lesson.",
  },
  {
    icon: "scroll",
    title: "Quests and Deeds",
    body: "Daily, weekly and seasonal quests reward the deeds that build the realm. The Watch remembers everything you do.",
  },
  {
    icon: "banner",
    title: "House Glory",
    body: "Your Glory raises your House. Houses war for the season crown, and the winning House shares the season vault.",
  },
];

const previewCards = [
  { label: "Season I", value: "The First Throne", sub: "Opens after presale" },
  /* "Starting rank", not "Your rank". This page is a static preview of an
     unopened game, so it knows nothing about the viewer; a card that said
     "Your rank: Smallfolk" was a personal reading nobody had performed, which
     is an invented figure wearing words instead of digits (rule 4). The
     ladder's first rung is a fact about the game and is presented as one. */
  { label: "Starting rank", value: "Smallfolk", sub: "Rise to King or Queen" },
  { label: "House", value: "Choose your banner", sub: "Six Houses, one crown" },
];

export default function ThroneComingSoon() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        <BackButton href="/home" />
      </div>

      {/* The one Forge moment on this route. */}
      <Card
        render={
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          />
        }
        pad="hero"
        className="relative overflow-hidden text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(217, 176, 64,0.20), transparent 70%)",
          }}
        />
        <span className="hairline relative inline-flex items-center gap-1.5 rounded-sm bg-panel-warm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">
          Chapter of the Season
        </span>
        <div className="relative mt-5 flex justify-center">
          <Icon3D name="crown" size="hero" priority />
        </div>
        {/* One word per line is not a kicker. At 390px with this tracking,
            "The season game · Coming soon" broke across two rows. */}
        <p className="relative mt-5 text-xs uppercase tracking-[0.3em] text-bone-faint">
          Coming soon
        </p>
        <h1 className="gold-text relative mt-2 font-display text-3xl font-semibold tracking-wide sm:text-4xl">
          Claim the Throne
        </h1>
        <p className="relative mx-auto mt-4 max-w-md text-sm leading-relaxed text-bone-mut">
          The realm&apos;s season game is being forged. Earn Glory, duel for
          honor, raise your House and race for the Iron Throne. It opens to the
          realm at launch. Hold the line.
        </p>
        <Button
          variant="gold"
          size="lg"
          className="relative mt-7"
          render={<Link href="/ravens" />}
        >
          Notify me
        </Button>
        <p className="relative mt-3 text-[11px] text-bone-faint">
          A raven will find you the day this chapter opens.
        </p>
      </Card>

      {/* Ledger from here down. Flat plates, no glow, no motion. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {previewCards.map((c) => (
          <Card key={c.label} variant="raised" radius="lg" pad="md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              {c.label}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-bone">
              {c.value}
            </p>
            <p className="mt-0.5 text-xs text-bone-faint">{c.sub}</p>
          </Card>
        ))}
      </div>

      <SectionHeader title="A sneak peek of the season" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PILLARS.map((p) => (
          /* No `interactive`: these are inert. A hover lift on content that
             cannot be clicked is a broken affordance, and all four carried one. */
          <Card key={p.title} variant="raised" radius="lg" pad="md" className="sm:p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-steel-line bg-void text-bone-mut">
              <Icon name={p.icon} className="h-[18px] w-[18px]" />
            </span>
            <h3 className="mt-3 font-display text-base font-semibold text-bone">
              {p.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
              {p.body}
            </p>
          </Card>
        ))}
      </div>

      <Card variant="raised" pad="md" className="flex items-start gap-2.5">
        <Icon name="flame" className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
        <p className="text-sm text-bone-mut">
          The throne is claimed at launch. Follow the realm and be ready when
          the season opens.
        </p>
      </Card>
    </div>
  );
}
