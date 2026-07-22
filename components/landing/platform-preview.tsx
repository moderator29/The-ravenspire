"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { LandingIcon } from "@/components/landing/icons";
import { CrestRoundel } from "@/components/brand/crests";
import { RavenMark } from "@/components/brand/raven-mark";

/*
  Platform preview. Every surface here is a styled mockup built from divs,
  no external screenshots, so it renders even when no art is present. It
  shows the four rooms of the realm: the Ravenry feed, Whispers, Houses,
  and a Keep.
*/

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

function Chip({ label, tone = "gold" }: { label: string; tone?: "gold" | "ember" }) {
  const color = tone === "ember" ? "text-ember" : "text-gold";
  const border = tone === "ember" ? "border-ember/40" : "border-gold/30";
  return (
    <span
      className={`rounded-full border ${border} px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${color}`}
    >
      {label}
    </span>
  );
}

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
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center gap-2 border-b border-steel-line/70 bg-void/60 px-4 py-2.5">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-mut">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-steel-line" />
          <span className="h-1.5 w-1.5 rounded-full bg-steel-line" />
          <span className="h-1.5 w-1.5 rounded-full bg-gold/50" />
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Avatar({ icon = "user" }: { icon?: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gradient-to-b from-panel-warm to-void text-gold">
      <Icon name={icon} className="h-4 w-4" />
    </span>
  );
}

/* ----- The Ravenry: feed ----- */
function RavenryMock() {
  return (
    <Frame title="The Ravenry" icon="home">
      <div className="flex flex-col gap-3">
        <div className="glass-sm rounded-2xl border border-steel-line bg-panel p-3">
          <div className="flex items-center gap-2.5">
            <Avatar icon="raven" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-bone">
                Aeron Blackwood <Chip label="Corvane" />
              </p>
              <p className="text-[10px] text-bone-faint">@aeron · 2m</p>
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-bone-mut">
            Sealed a Call on the Season close. If Emberfall goes quiet by the
            bell, House Corvane takes the Throne. The ravens are watching.
          </p>
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-gold/20 bg-panel-warm px-3 py-2">
            <Icon name="target" className="h-4 w-4 text-gold" />
            <span className="text-[11px] font-semibold text-bone">Call sealed</span>
            <span className="ml-auto rounded-full border border-gold/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gold">
              Judged live
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-5 text-bone-faint">
            <span className="flex items-center gap-1 text-[11px]">
              <Icon name="heart" className="h-3.5 w-3.5" /> 214
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <Icon name="reply" className="h-3.5 w-3.5" /> 38
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <Icon name="repost" className="h-3.5 w-3.5" /> 61
            </span>
          </div>
        </div>
        <div className="glass-sm rounded-2xl border border-steel-line bg-panel p-3">
          <div className="flex items-center gap-2.5">
            <Avatar icon="user" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-bone">
                Mira Stormborn <Chip label="Stormcrest" tone="ember" />
              </p>
              <p className="text-[10px] text-bone-faint">@mira · 11m</p>
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-bone-mut">
            Duel of wits at the crossroads tonight. Bring your sharpest line,
            leave your excuses at the gate.
          </p>
        </div>
      </div>
    </Frame>
  );
}

/* ----- Whispers: direct messages ----- */
function WhispersMock() {
  return (
    <Frame title="Whispers" icon="mail">
      <div className="flex items-center gap-2.5 border-b border-steel-line/60 pb-2.5">
        <Avatar icon="user" />
        <div>
          <p className="text-[13px] font-semibold text-bone">Lady Ysolde</p>
          <p className="text-[10px] text-gold">House Goldmane · online</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        <div className="flex justify-start">
          <div className="glass-sm max-w-[80%] rounded-2xl rounded-tl-md px-3 py-2 text-[12px] text-bone-mut">
            The Throne shifts this week. Will Goldmane hold the lead?
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-panel-warm px-3 py-2 text-[12px] text-bone">
            Only if your knights stop losing duels they start.
          </div>
        </div>
        <div className="flex justify-start">
          <div className="glass-sm max-w-[80%] rounded-2xl rounded-tl-md px-3 py-2 text-[12px] text-bone-mut">
            Bold words. Court at dusk, then. Bring witnesses.
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-full border border-steel-line bg-void px-3 py-2">
        <span className="text-[11px] text-bone-faint">Send a whisper</span>
        <Icon name="send" className="ml-auto h-4 w-4 text-gold" />
      </div>
    </Frame>
  );
}

/* ----- Houses: the six banners ----- */
const houseRows = [
  { name: "House Corvane", glory: 4820, pct: 100, tone: "gold" as const },
  { name: "House Emberfall", glory: 4580, pct: 92, tone: "ember" as const },
  { name: "House Goldmane", glory: 4210, pct: 84, tone: "gold" as const },
  { name: "House Frosthold", glory: 3960, pct: 78, tone: "gold" as const },
];

function HousesMock() {
  return (
    <Frame title="Houses" icon="banner">
      <p className="mb-3 text-[11px] text-bone-faint">
        Season I standings · six banners, one Throne
      </p>
      <div className="flex flex-col gap-2.5">
        {houseRows.map((h, i) => (
          <div
            key={h.name}
            className="glass-sm rounded-xl border border-steel-line bg-panel px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-[11px] font-bold text-bone-faint">
                {i + 1}
              </span>
              <Icon name="banner" className="h-3.5 w-3.5 text-gold" />
              <span className="text-[12px] font-semibold text-bone">{h.name}</span>
              <span className="tnum ml-auto text-[12px] font-semibold text-gold-bright">
                {h.glory.toLocaleString("en-US")}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-void">
              <div
                className={h.tone === "ember" ? "h-full rounded-full" : "gold-metal h-full rounded-full"}
                style={{
                  width: `${h.pct}%`,
                  background: h.tone === "ember" ? "var(--ember)" : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ----- The Keep: a profile ----- */
function KeepMock() {
  return (
    <Frame title="The Keep" icon="user">
      <div className="relative -mx-4 -mt-4 h-16 bg-gradient-to-br from-panel-warm via-void to-panel" />
      <div className="-mt-8 flex items-end gap-3 px-0">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-void text-gold">
          <RavenMark className="h-9 w-9" />
        </span>
        <div className="pb-1">
          <p className="font-display text-[15px] font-semibold text-bone">Aeron Blackwood</p>
          <p className="text-[11px] text-bone-faint">@aeron · House Corvane</p>
        </div>
        <span className="mb-1 ml-auto rounded-full border border-gold/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
          Warden
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <CrestRoundel icon="feather" className="h-9 w-9" />
        <CrestRoundel icon="crossed-swords" className="h-9 w-9" />
        <CrestRoundel icon="tower-crown" className="h-9 w-9" />
        <CrestRoundel icon="laurel" dim className="h-9 w-9" />
        <CrestRoundel icon="key" dim className="h-9 w-9" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { k: "Renown", v: "8,140" },
          { k: "Calls won", v: "27" },
          { k: "Duels", v: "19-4" },
        ].map((s) => (
          <div key={s.k} className="glass-sm rounded-xl border border-steel-line bg-panel py-2">
            <p className="tnum font-display text-sm font-semibold text-gold-bright">{s.v}</p>
            <p className="text-[9px] uppercase tracking-[0.14em] text-bone-faint">{s.k}</p>
          </div>
        ))}
      </div>
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
    <motion.section
      id="realm"
      ref={ref}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="glass relative scroll-mt-28 overflow-hidden p-7 sm:p-9"
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-void/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          Live product preview
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
        to rally behind a banner. Your Keep to prove what you have earned. Every
        surface is built to live in.
      </motion.p>

      <div className="relative mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
        <motion.div variants={rise} style={{ y: yA }} className="flex flex-col gap-4">
          <RavenryMock />
          <HousesMock />
        </motion.div>
        <motion.div variants={rise} style={{ y: yB }} className="flex flex-col gap-4">
          <WhispersMock />
          <KeepMock />
        </motion.div>
      </div>
    </motion.section>
  );
}
