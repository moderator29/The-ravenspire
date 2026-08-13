"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { LandingIcon } from "@/components/landing/icons";
import { crests, CrestRoundel } from "@/components/brand/crests";
import { houses } from "@/lib/data/houses";

/*
  Platform preview: the four rooms of the realm, shown honestly.

  WHAT THIS USED TO BE, AND WHY IT HAD TO CHANGE. This section was a set of
  styled mockups, and the mockups were populated: a raven from "@aeron · 2m"
  with 214 likes, 38 replies and 61 reposts, a Whispers thread with invented
  messages from a member who does not exist, a Season standings table where
  House Corvane held 4,820 Glory, and a Keep with 8,140 Renown and a duel
  record of 19-4.

  Every one of those numbers was invented, and they sat on the most public page
  in the product, next to real claims about a real platform. AGENTS.md rule 4
  bans exactly this and part two of the plan restates it in the sharpest terms
  available: previewing the real catalog is honest, and what stays banned is
  invented owners, invented balances, and any number pretending to be live.
  A visitor reading "4,820" had no way to know it was decoration, which is
  precisely what makes it dishonest rather than merely illustrative.

  WHAT IT IS NOW. The same four rooms, the same craft, and not one invented
  figure. Two of the frames carry genuinely real data: the six Houses are the
  live roster with their real sigils and real mottos, and the Keep shows the
  real crest set with its real names. The other two show the chrome of a room
  with its content deliberately empty, which is what a room looks like before
  anybody has spoken in it, and is the same honest empty state the product
  itself renders.

  Live figures are not absent from this page. They are in LiveRealmStats, which
  reads them from the realm, which is where a number belongs.
*/

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function Frame({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="raised" pad="none" radius="xl" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-steel-line/60 bg-void/50 px-4 py-2.5">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-mut">
          {title}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/* The line every empty frame carries. Said plainly, because a room drawn with
   nothing in it should explain itself rather than look broken. */
function EmptyRoom({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-bone-faint">{children}</p>
  );
}

/* ----- The Ravenry: the composer and the actions, with nothing put in them ----- */
function RavenryRoom() {
  return (
    <Frame title="The Ravenry" icon="home">
      <div className="rounded-lg border border-steel-line bg-panel p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gradient-to-b from-panel-warm to-void text-gold">
            <Icon name="feather" className="h-4 w-4" />
          </span>
          <span className="text-[12px] text-bone-faint">
            Send a raven to the realm
          </span>
        </div>
        {/* The action row, real icons, no counts. A count here would be the
            same invented number in a smaller font. */}
        <div className="mt-3 flex items-center gap-5 border-t border-steel-line/60 pt-2.5 text-bone-faint">
          <Icon name="heart" className="h-3.5 w-3.5" />
          <Icon name="reply" className="h-3.5 w-3.5" />
          <Icon name="repost" className="h-3.5 w-3.5" />
          <Icon name="target" className="ml-auto h-3.5 w-3.5 text-gold" />
        </div>
      </div>
      <EmptyRoom>
        Post, reply and seal a Call on a live price. The Ravenry judges the
        call, not the caller.
      </EmptyRoom>
    </Frame>
  );
}

/* ----- Whispers: a thread with nothing in it ----- */
function WhispersRoom() {
  return (
    <Frame title="Whispers" icon="mail">
      <div className="flex flex-col gap-2.5">
        {/* Two empty bubbles, one each side, which is the shape of a
            conversation without inventing one. */}
        <div className="flex justify-start">
          <div className="h-7 w-[62%] rounded-2xl rounded-bl-md border border-steel-line/70 bg-panel" />
        </div>
        <div className="flex justify-end">
          <div className="h-7 w-[48%] rounded-2xl rounded-br-md bg-panel-warm" />
        </div>
        <div className="flex justify-start">
          <div className="h-7 w-[54%] rounded-2xl rounded-bl-md border border-steel-line/70 bg-panel" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-steel-line bg-panel px-3 py-2">
        <span className="text-[12px] text-bone-faint">Whisper something</span>
        <Icon name="send" className="ml-auto h-4 w-4 text-gold" />
      </div>
      <EmptyRoom>
        Private, member to member, with images and tribute in the same thread.
      </EmptyRoom>
    </Frame>
  );
}

/* ----- Houses: the six real banners ----- */
function HousesRoom() {
  return (
    <Frame title="Houses" icon="banner">
      <div className="flex flex-col gap-2">
        {/* The live roster, names, sigils and mottos exactly as the realm
            holds them. No standings: Glory is a live figure and belongs on the
            Houses page, read from the realm rather than typed here. */}
        {houses.map((house) => (
          <div
            key={house.name}
            className="flex items-center gap-2.5 rounded-lg border border-steel-line bg-panel px-3 py-2"
          >
            <Icon name={house.sigil} className="h-4 w-4 shrink-0 text-gold" />
            <span className="truncate text-[12px] font-semibold text-bone">
              {house.name}
            </span>
            <span className="ml-auto truncate text-[10px] italic text-bone-faint">
              {house.motto}
            </span>
          </div>
        ))}
      </div>
      <EmptyRoom>
        Six banners, one Throne. Standings are live inside the realm and move
        every day of a Season.
      </EmptyRoom>
    </Frame>
  );
}

/* ----- The Keep: the real crests ----- */
function KeepRoom() {
  /* The first five of the real crest set, in the order the realm lists them.
     Names and roundels both come from the crest catalog, so this can never
     advertise a badge that does not exist. */
  const shown = crests.slice(0, 5);

  return (
    <Frame title="The Keep" icon="user">
      <div className="relative -mx-4 -mt-4 h-16 bg-gradient-to-br from-panel-warm via-void to-panel" />
      <div className="-mt-5 flex items-end gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-void text-gold">
          {/* `wall` is the Keep glyph the icon set actually ships. Naming an
              icon that does not exist renders nothing at all, which is how a
              hole appears on a landing page nobody notices until a founder
              does. */}
          <Icon name="wall" className="h-8 w-8" />
        </span>
        <div className="pb-1">
          <p className="font-display text-[15px] font-semibold text-bone">
            Your Keep
          </p>
          <p className="text-[11px] text-bone-faint">
            Your name, your House, your deeds
          </p>
        </div>
      </div>

      {/* The real crests, named. A roundel with a name under it is a fact
          about the realm; the same roundel over an invented Renown total was
          decoration pretending to be a record. */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {shown.map((crest) => (
          <div key={crest.slug} className="flex flex-col items-center gap-1">
            <CrestRoundel icon={crest.icon} className="h-9 w-9" dim />
            <span className="w-full truncate text-center text-[9px] leading-tight text-bone-faint">
              {crest.plain}
            </span>
          </div>
        ))}
      </div>
      <EmptyRoom>
        Crests are earned by deed, never bought, and bound to you. Renown and
        standing are read from the realm, never guessed at.
      </EmptyRoom>
    </Frame>
  );
}

export function PlatformPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const yA = useTransform(scrollYProgress, [0, 1], [34, -34]);
  const yB = useTransform(scrollYProgress, [0, 1], [-24, 24]);

  return (
    <Card
      render={
        <motion.section
          id="realm"
          ref={ref}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={container}
        />
      }
      pad="none"
      className="relative scroll-mt-28 overflow-hidden p-7 sm:p-9"
    >
      {/* Ambient premium glow: warm gold meeting a cool steel edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(229,112,42,0.18), transparent 70%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(110,118,131,0.22), transparent 70%)" }}
      />

      <motion.div variants={rise} className="relative flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          <LandingIcon name="vision" className="h-4 w-4" />
          See the realm
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-gold/25 bg-void/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          The rooms, not the numbers
        </span>
      </motion.div>
      <motion.h2
        variants={rise}
        className="relative mt-3 font-display text-2xl font-semibold text-bone sm:text-3xl"
      >
        Four rooms of one living realm
      </motion.h2>
      <motion.p
        variants={rise}
        className="relative mt-3 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        The Ravenry to post and seal Calls. Whispers to plot in private. Houses
        to rally behind a banner. Your Keep to prove what you have earned. The
        Houses and the crests below are the realm&rsquo;s own, exactly as it
        holds them. Everything that moves is read live inside, so you will not
        find an invented figure on this page.
      </motion.p>

      <div className="relative mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        <motion.div variants={rise} style={{ y: yA }} className="flex flex-col gap-4">
          <RavenryRoom />
          <HousesRoom />
        </motion.div>
        <motion.div variants={rise} style={{ y: yB }} className="flex flex-col gap-4">
          <WhispersRoom />
          <KeepRoom />
        </motion.div>
      </div>
    </Card>
  );
}
