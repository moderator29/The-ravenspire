"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { RavenMark } from "@/components/brand/raven-mark";
import { Button } from "@/components/ui/button";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";

/*
  The landing top bar. Sticky, glassy, premium. Logo left, in-page anchor
  links center, an Enter the Realm CTA right. Anchors scroll smoothly (or
  jump, for reduced-motion users) to sections that carry matching ids and a
  scroll-margin so the sticky bar never hides the heading.
*/

type NavLink = {
  label: string;
  target: string;
  icon: LandingIconName;
  /* route links leave the page; anchors jump within it */
  route?: boolean;
};

/* "Season Zero" pointed here until the section itself was replaced by
   PumpFunLaunch (components/landing/pump-fun-launch.tsx); jump() below finds
   nothing for an id that no longer renders and silently does nothing, so the
   link kept its label and target for a while as a genuinely dead click. It
   now names and targets the section that actually occupies that scroll
   position. */
const links: NavLink[] = [
  { label: "Overview", target: "overview", icon: "overview" },
  { label: "Pump.fun", target: "pump-fun", icon: "coin" },
  { label: "Features", target: "features", icon: "features" },
  { label: "Games", target: "games", icon: "games" },
  { label: "The Realm", target: "realm", icon: "realm" },
  { label: "Docs", target: "/chronicle", icon: "docs", route: true },
];

export function LandingNav({
  ctaHref,
  ctaLabel,
}: {
  ctaHref: string;
  ctaLabel: string;
}) {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-x-0 top-0 z-nav flex justify-center px-3 pt-3 sm:px-6 sm:pt-4"
    >
      {/* The scrim behind the floating bar.

          The bar is an inset card, so three strips of the page were never
          covered by it at all: the 12 to 16px above it and the gutters either
          side. Measured at 1440 while scrolled, "The $RSP allocation" at 30px
          display read straight through the bar and out into the strip above
          it, and the same happened on every section heading down the page.
          `bg-void/72` behind a 24px backdrop blur is simply not enough scrim
          for display type passing underneath.

          A full bleed gradient fixes the strips as well as the bar, and it
          fades out rather than ending on a hard line, so the bar still reads
          as floating rather than as a solid header rail. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 transition-opacity duration-base ease-out-quint ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(180deg, var(--obsidian) 0%, rgba(7,7,10,0.88) 46%, transparent 100%)",
        }}
      />
      <nav
        className={`relative flex w-full max-w-5xl items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-300 sm:px-4 ${
          scrolled
            ? "border-gold/18 bg-void/88 shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        {/* Brand first, and hard left.

            It used to sit between the anchors and the call to action with a
            `flex-1` spacer on each side, on the theory that equal flex boxes
            would centre it. They do not: `flex-1` is `flex-basis: 0` plus
            grow, but neither box can shrink below its own content, and the
            anchor row is twice the width of the button. Measured at 1440, the
            wordmark's centre sat 17px right of the bar's, with 28px of air
            between it and "Docs" and 192px between it and the button. So it
            was neither left aligned nor centred: it read as a sixth nav link
            with a hole punched beside it.

            Brand, then anchors, then the action on the right is the shape a
            reader already knows, and it cannot drift when a label changes. */}
        <Link
          href="/"
          /* `min-h-11` on a finger, so the mark keeps its size and the link
             keeps the floor. It measured 28 square once the spacing scale
             stopped inflating `h-7`, which it had been hiding behind. Both
             axes, since the mark is 28 square and a floor on one axis alone
             leaves a target that is still too narrow for a thumb. */
          className="flex shrink-0 items-center gap-2.5 touch:min-h-11 touch:min-w-11 md:mr-3"
          aria-label="The Ravenspire home"
        >
          <RavenMark className="h-7 w-7" />
          {/* The header did not fit at 390px: the bar wanted 422px inside a
              364px box, so the menu toggle ran 45px off the right edge of the
              screen. Nothing caught it because the nav is fixed, and a fixed
              element that overflows never grows the document.

              The wordmark is what did not fit. "THE RAVENSPIRE" at 0.18em
              tracking is about 160px, which a phone bar cannot spend beside a
              call to action and a menu. The mark alone carries the brand at
              that size, which is what a premium app does on a phone rather
              than shrinking its own name until it is unreadable. */}
          <span className="gold-text hidden font-display text-sm font-semibold tracking-[0.18em] sm:inline sm:text-base">
            THE RAVENSPIRE
          </span>
        </Link>

        {/* Desktop anchors.

            `hidden md:flex` rather than only hiding its contents. Empty but
            present, an anchor row still claimed a share of a 390px bar, which
            is part of why the header did not fit on a phone. */}
        <div className="hidden items-center gap-1 md:flex">
          {/* `whitespace-nowrap` because "The Realm" is the only two word label
              in the set and it wrapped to two lines at 1440, which broke the
              header's baseline and read as a rendering fault. A nav label is a
              name; it does not wrap.

              `rounded-md`, not `rounded-xl`. These are 36px tall and 20px is a
              capsule at that height, whatever the rung is called: five fully
              rounded nav items were the first shape anyone saw on the site,
              and a capsule is the one shape the design law forbids on a
              control. 12px is the rung the scale names for nav items. */}
          {links.map((l) =>
            l.route ? (
              <Link
                key={l.label}
                href={l.target}
                className="whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={`#${l.target}`}
                onClick={(e) => {
                  e.preventDefault();
                  jump(l.target);
                }}
                className="whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
              >
                {l.label}
              </a>
            )
          )}
        </div>

        {/* Right group: CTA + mobile toggle */}
        <div className="ml-auto flex items-center gap-2">
          {/* The realm's primary call to action, and it measured 94x36 on a
              phone, which is under the 44px this product holds itself to. It
              is the single most tapped control on the site. */}
          <Button variant="gold" size="lg" render={<Link href={ctaHref} />}>
            <span className="hidden sm:inline">{ctaLabel}</span>
            <span className="sm:hidden">Enter</span>
            <LandingIcon name="arrowRight" className="h-4 w-4" />
          </Button>

          {/* Mobile menu toggle */}
          {/* Square, and sized by the same 44px minimum. It carried an
              explicit h-9 w-9, which is 36px, so it was the smallest target
              on a screen where it is one of only two.

              `pad="none"`, not `p-0` in the class list, and this one was
              rendering nothing at all. Button composes its own horizontal
              padding from the size (`lg` is `px-5`) and mergeClasses arbitrates
              `p-` and `px-` as separate properties, so a caller's `p-0` does
              not displace `px-5`: both survive, and `px-5` is emitted later.
              Inside a 44px box that leaves 44 - 40 - 2 = 2px of content, and
              the hamburger, measured, was a 2px wide svg. The only control a
              phone has for the whole nav was an empty box with a dot in it.
              `pad` is the primitive's own answer to exactly this. */}
          <Button
            variant="glass"
            size="lg"
            pad="none"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="h-11 w-11 shrink-0 md:hidden"
          >
            <LandingIcon name={open ? "close" : "menu"} className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile dropdown */}
        {open && (
          /* Each row is `rounded-md` and `min-h-11`. At `rounded-xl` they were
             40px tall with a 20px radius, which is exactly half the box and
             therefore a capsule, and 40px is also four pixels under the touch
             floor this product holds itself to. */
          <Card render={<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} />} pad="none" className="absolute inset-x-3 top-full mt-2 flex flex-col gap-1 p-3 md:hidden">
            {links.map((l) =>
              l.route ? (
                <Link
                  key={l.label}
                  href={l.target}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
                >
                  <LandingIcon name={l.icon} className="h-4 w-4 text-gold" />
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.label}
                  href={`#${l.target}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    jump(l.target);
                  }}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
                >
                  <LandingIcon name={l.icon} className="h-4 w-4 text-gold" />
                  {l.label}
                </a>
              )
            )}
          </Card>
        )}
      </nav>
    </motion.header>
  );
}
