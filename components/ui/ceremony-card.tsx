"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/* THE CEREMONY CARD, one chassis for every "a real transfer of value just
 * happened" moment.
 *
 * Before this, a tip's success screen (a struck-gold medallion, a ring of
 * sparks, a shimmer sweep) and a trade's success screen (a plain bordered
 * circle, no motion at all) were two different products describing the same
 * kind of moment: a member's own wallet just signed something real. This is
 * the one place rule 21's Forge register is earned honestly, not decoration
 * sprinkled on: a member chose to move value, non-custodially, and that is
 * worth a beat before the interface goes back to being quiet.
 *
 * The hero (medallion, sparks, kicker, headline, subline, footnote) is owned
 * here so it stays one signature across every real-money surface. The BODY
 * is a slot: a tip needs an explorer link, a trade needs a transaction card,
 * a share button and a "turn this into a Call" link, and neither list should
 * live inside a shared component that then has to know about both callers.
 */

export function CeremonyCard({
  icon = "coin",
  image,
  kicker,
  headline,
  subline,
  footnote,
  children,
}: {
  /* Shown inside the medallion when no image is given. */
  icon?: string;
  /* A real logo (a coin's own art), shown instead of the icon when present. */
  image?: string | null;
  /* The small tracked line above the headline: "Tribute sent", "Bought". */
  kicker: string;
  /* The big gold line: an amount and symbol, or just a symbol. */
  headline: ReactNode;
  subline?: ReactNode;
  /* The honest non-custodial line under the subline. */
  footnote?: ReactNode;
  /* Whatever the caller needs below the hero: a transaction card, a share
     button, a next-action link, a Done button. */
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();

  const coinVariants: Variants = {
    hidden: { scale: 0.4, opacity: 0, rotate: -30 },
    show: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: reduce
        ? { duration: 0.2 }
        : { type: "spring", stiffness: 220, damping: 14, delay: 0.05 },
    },
  };

  /* Eight sparks flung outward from the medallion. */
  const sparks = Array.from({ length: 8 });

  return (
    <Card
      variant="warm"
      pad="xl"
      render={
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      }
      className="relative w-full max-w-md overflow-hidden text-center"
    >
      {/* Radiant gold wash behind the medallion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(255, 233, 163,0.18), rgba(217, 176, 64,0.05) 42%, transparent 70%)",
        }}
      />
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 1.6, ease: "easeInOut", delay: 0.35 }}
          style={{
            background:
              "linear-gradient(75deg, transparent 40%, rgba(255,244,214,0.16) 50%, transparent 60%)",
          }}
        />
      )}

      <div className="relative flex flex-col items-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {!reduce &&
            sparks.map((_, i) => {
              const angle = (i / sparks.length) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-gold-bright"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
                  animate={{
                    x: Math.cos(angle) * 52,
                    y: Math.sin(angle) * 52,
                    opacity: [0, 1, 0],
                    scale: [0.6, 1, 0.4],
                  }}
                  transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
                />
              );
            })}
          <motion.div
            variants={coinVariants}
            initial="hidden"
            animate="show"
            className="gold-metal flex h-20 w-20 items-center justify-center overflow-hidden rounded-full shadow-[inset_0_2px_4px_rgba(255,244,214,0.6),inset_0_-4px_8px_rgba(90,66,20,0.5),0_10px_30px_rgba(217,176,64,0.35)]"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <Icon name={icon} className="h-9 w-9 text-[#171204]" />
            )}
          </motion.div>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
          {kicker}
        </p>
        <div className="tnum mt-2 font-display text-4xl font-bold gold-text">
          {headline}
        </div>
        {subline ? (
          <p className="mt-2 text-sm text-bone-mut">{subline}</p>
        ) : null}
        {footnote ? (
          <p className="mt-1 text-[11px] text-bone-faint">{footnote}</p>
        ) : null}

        {children ? (
          <div className="mt-6 flex w-full flex-col items-stretch gap-2">
            {children}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
