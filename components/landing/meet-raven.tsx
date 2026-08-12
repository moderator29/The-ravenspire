"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion, type Variants } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";

/*
  Meet @raven. Grounded in lib/ai/raven-voice (the real system prompt) and the
  real card surfaces in components/raven/cards. We never print a fabricated
  live price here: the demo card shows the fields @raven fills from real data,
  labelled as such, in keeping with the realm's real-data-only vow.
*/

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const powers = [
  {
    icon: "eye",
    title: "Real intel, never invented",
    body: "Reads any token or wallet from live market and on-chain data. If a figure is not in front of it, it says so instead of guessing.",
  },
  {
    icon: "raven",
    title: "A voice you will quote",
    body: "Witty, regal, warm under the polish. Helpful first, flavor second. It settles debates and narrates the Season like a herald.",
  },
  {
    icon: "coin",
    title: "Living cards, inline",
    body: "Answers arrive with price and wallet cards built from real numbers, so the read and the receipt sit side by side.",
  },
];

const chat = [
  { from: "user", text: "@raven settle this, is a hotdog a sandwich?" },
  {
    from: "raven",
    text: "Bread embracing filling meets the letter of sandwich law, but no one who orders a sandwich expects a hotdog to arrive. Verdict: technically yes, spiritually no. Both of you may claim victory, the rarest outcome in The Ravenspire.",
  },
  { from: "user", text: "@raven read $RSP for me." },
  {
    from: "raven",
    text: "The scrolls before me carry the live figures, not my invention. A card rides below with price, day move and market cap, straight from the markets. I read the weather, I do not promise the sky.",
  },
];

export function MeetRaven() {
  return (
    <Card render={<motion.section initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={container} />} pad="none" className="overflow-hidden p-7 sm:p-9">
      <motion.div
        variants={rise}
        className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4"
      >
        {/* The Herald's own 3D icon, which is the identity of this feature
            rather than decoration.

            Stacked below sm. Measured on a 390px viewport, a 96px icon on the
            same row left about 230px for the heading, which broke "Meet
            @raven" across two lines and made the section title read as two
            fragments. */}
        <Icon3D name="herald-ai" size="lg" priority />
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
            <Icon name="raven" className="h-4 w-4" />
            The Herald
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-bone sm:text-3xl">
            Meet @raven
          </h2>
        </div>
      </motion.div>

      <motion.p
        variants={rise}
        className="mt-4 max-w-prose text-[15px] leading-relaxed text-bone-mut"
      >
        Tag @raven in any raven or whisper. It answers anything, reads any token
        or wallet over real data, and does it in the voice of the realm. Helpful
        first, flavor always.
      </motion.p>

      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Powers */}
        <div className="flex flex-col gap-3">
          {powers.map((p) => (
            <Card key={p.title} render={<motion.div variants={rise} />} radius="lg" pad="none" variant="raised" className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-void text-gold">
                <Icon name={p.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-bone">{p.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-bone-mut">{p.body}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Chat + demo card */}
        <Card render={<motion.div variants={rise} />} radius="lg" pad="none" variant="raised" className="p-4">
          <div className="flex flex-col gap-3">
            {chat.map((m, i) =>
              m.from === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-panel-warm px-3.5 py-2 text-[13px] text-bone">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-void text-gold">
                    <Icon name="raven" className="h-3.5 w-3.5" />
                  </span>
                  <Card radius="lg" pad="none" className="max-w-[85%] px-3.5 py-2 text-[13px] text-bone-mut">
                    {m.text}
                  </Card>
                </div>
              )
            )}

            {/* Schematic card: shows the fields @raven fills from live data,
                without printing a fabricated number. */}
            <div className="ml-9 flex min-w-[200px] max-w-[260px] flex-col gap-1.5 rounded-2xl border border-gold/20 bg-panel px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-sm font-semibold text-bone">$RSP</span>
                <Icon name="coin" className="h-4 w-4 text-gold" />
              </div>
              {[
                { k: "Price", v: "live" },
                { k: "24h", v: "live" },
                { k: "Market cap", v: "live" },
                { k: "Risk read", v: "clean" },
              ].map((r) => (
                <div key={r.k} className="flex items-center justify-between text-[11px]">
                  <span className="text-bone-faint">{r.k}</span>
                  <span className="rounded-[--radius-sm] border border-gold/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gold">
                    {r.v}
                  </span>
                </div>
              ))}
              <p className="mt-1 text-[10px] leading-snug text-bone-faint">
                Filled from real market data, never invented.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <motion.div variants={rise}>
        <Link
          href="/raven"
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
        >
          Summon the Raven
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </motion.div>
    </Card>
  );
}
