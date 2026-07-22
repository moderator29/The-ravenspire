"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { RavenMark } from "@/components/brand/raven-mark";
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

const links: NavLink[] = [
  { label: "Overview", target: "overview", icon: "overview" },
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
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:px-6 sm:pt-4"
    >
      <nav
        className={`flex w-full max-w-5xl items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-300 sm:px-4 ${
          scrolled
            ? "border-gold/18 bg-void/72 shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        {/* Left group: desktop anchors. flex-1 so it balances the right group
            and the centered brand sits dead center of the bar. */}
        <div className="flex flex-1 items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) =>
              l.route ? (
                <Link
                  key={l.label}
                  href={l.target}
                  className="rounded-xl px-3 py-2 text-[13px] font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
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
                  className="rounded-xl px-3 py-2 text-[13px] font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
                >
                  {l.label}
                </a>
              )
            )}
          </div>
        </div>

        {/* Center: brand, perfectly balanced between the two flex-1 groups */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="The Ravenspire home"
        >
          <RavenMark className="h-7 w-7" />
          <span className="gold-text font-display text-sm font-semibold tracking-[0.18em] sm:text-base">
            THE RAVENSPIRE
          </span>
        </Link>

        {/* Right group: CTA + mobile toggle */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <Link href={ctaHref} className="btn-gold px-4 py-2 text-[13px]">
            <span className="hidden sm:inline">{ctaLabel}</span>
            <span className="sm:hidden">Enter</span>
            <LandingIcon name="arrowRight" className="h-4 w-4" />
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-void/60 text-bone-mut transition hover:text-bone md:hidden"
          >
            <LandingIcon name={open ? "close" : "menu"} className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="glass absolute inset-x-3 top-full mt-2 flex flex-col gap-1 p-3 md:hidden"
          >
            {links.map((l) =>
              l.route ? (
                <Link
                  key={l.label}
                  href={l.target}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
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
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-bone-mut transition hover:bg-gold/5 hover:text-bone"
                >
                  <LandingIcon name={l.icon} className="h-4 w-4 text-gold" />
                  {l.label}
                </a>
              )
            )}
          </motion.div>
        )}
      </nav>
    </motion.header>
  );
}
