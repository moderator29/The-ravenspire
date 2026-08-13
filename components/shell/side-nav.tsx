"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RavenMark } from "@/components/brand/raven-mark";
import { StreakFlame } from "@/components/shell/streak-flame";
import {
  primaryNav,
  collectionNav,
  socialNav,
  toolsNav,
  accountNav,
  comingSoonNav,
} from "@/lib/nav";
import type { NavItem } from "@/lib/nav";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { NotifBadge } from "@/components/notifications/notif-badge";

/* The desktop side navigation.

   Rebuilt for V2. The old version put roughly thirty flat links in one scroll
   column, which is a discovery failure rather than a navigation system, and it
   hid every plain language label behind :hover, so on a touch device a new
   member saw only "The Scrying Glass" and "The Bloodline" with no way to learn
   what either meant.

   Now: four anchors that never collapse, then collapsible sections for depth.
   The Tools group and the Chapters ahead are closed by default because they are
   nine beta surfaces and six teaser pages respectively, and neither deserves to
   dominate the first screen. Open state persists per section.

   Everything is a clean rounded rectangle. The active row carries a gold rail
   on its leading edge rather than a filled pill. */

const OPEN_KEY = "rvn_nav_open_v2";

function Row({
  item,
  active,
  depth = false,
}: {
  item: NavItem;
  active: boolean;
  depth?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-md py-[7px] pl-3 pr-2 text-[13px] transition-colors duration-150 ${
        active
          ? "bg-panel text-gold-bright"
          : "text-bone-mut hover:bg-panel/50 hover:text-bone"
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-rail"
          transition={{ type: "spring", visualDuration: 0.2, bounce: 0.1 }}
          className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-sm bg-gold-bright"
        />
      )}
      <Icon
        name={item.icon}
        className={`h-[17px] w-[17px] shrink-0 ${depth ? "opacity-80" : ""}`}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{item.themed}</span>

      {item.slug === "ravens" && <NotifBadge className="shrink-0" />}
      {item.badge && (
        <span className="shrink-0 rounded-sm border border-gold/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-gold/80">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function Section({
  label,
  items,
  pathname,
  defaultOpen,
  storageKey,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  defaultOpen: boolean;
  storageKey: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (!raw) return;
      const map = JSON.parse(raw) as Record<string, boolean>;
      if (typeof map[storageKey] === "boolean") setOpen(map[storageKey]);
    } catch {
      /* storage unavailable, the default stands for this visit */
    }
  }, [storageKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      map[storageKey] = next;
      localStorage.setItem(OPEN_KEY, JSON.stringify(map));
    } catch {
      /* storage unavailable, the toggle still works for this visit */
    }
  };

  /* A section holding the current page stays open regardless of preference, so
     a member is never looking at a page whose section appears collapsed. */
  const holdsCurrent = items.some(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`)
  );
  const shown = open || holdsCurrent;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        className="flex w-full items-center gap-1.5 rounded-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-faint transition-colors duration-fast hover:text-bone-mut"
      >
        <span className="flex-1 text-left">{label}</span>
        <Icon
          name="arrow"
          className={`h-3 w-3 transition-transform duration-fast ${
            shown ? "rotate-90" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {shown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 pt-0.5">
              {items.map((item) => (
                <Row
                  key={item.slug}
                  item={item}
                  depth
                  active={
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                  }
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { ready, authenticated, avatarUrl, displayName, xHandle } =
    useRealmAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void realmFetch<{ profile?: { is_admin?: boolean } }>("/api/me", {
      method: "POST",
    }).then((res) => {
      if (!cancelled) setIsAdmin(Boolean(res.data?.profile?.is_admin));
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  return (
    <nav
      className="scrollbar-none flex h-full flex-col overflow-y-auto px-2.5 py-4"
      /* Only a real navigation closes the drawer, and that distinction is the
         whole fix.
       *
       * This was a bare `onClick={onNavigate}` on the nav element, so every
       * click inside it closed the mobile drawer, including the Tools and
       * Chapters ahead section headers. Tapping Tools therefore did two things
       * at once: it expanded the section and it shut the drawer, so the member
       * was returned to whatever page was behind it (the Ravenry, usually) and
       * had to reopen the nav to see the section they had already opened. The
       * section was never broken; it was being dismissed in the same gesture.
       *
       * A section toggle is a `<button>`, a destination is an `<a>`, so the
       * event's own target says which happened. Closing on the anchor also
       * keeps the drawer honest when a link is followed by keyboard. */
      onClick={(e) => {
        if (!onNavigate) return;
        if ((e.target as HTMLElement).closest("a")) onNavigate();
      }}
    >
      <Link
        href="/home"
        className="mb-3 flex items-center gap-2.5 px-2 font-display text-[17px] font-semibold tracking-[0.08em]"
      >
        <RavenMark className="h-6 w-6" />
        <span className="gold-text">THE RAVENSPIRE</span>
      </Link>

      {authenticated ? (
        <Card render={<Link href="/keep" />} radius="lg" pad="sm" className="mb-1 flex items-center gap-2.5 transition-colors duration-150 hover:border-gold/30">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt="Your portrait"
              className="h-9 w-9 shrink-0 rounded-full border border-steel-line object-cover"
            />
          ) : (
            <div className="hairline flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
              <Icon name="user" className="h-[18px] w-[18px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-bone">
              {displayName ?? (xHandle ? `@${xHandle}` : "Your Keep")}
            </p>
            <p className="truncate text-[11px] text-bone-faint">View your Keep</p>
          </div>
          <StreakFlame className="shrink-0" />
        </Card>
      ) : (
        <Card radius="lg" pad="sm" className="mb-1">
          <div className="flex items-center gap-2.5">
            <div className="hairline flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
              <Icon name="user" className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-bone">
                Your Keep
              </p>
              <p className="truncate text-[11px] text-bone-faint">
                Enter the realm
              </p>
            </div>
          </div>
          <Button
            variant="gold"
            size="sm"
            block
            className="mt-2.5"
            render={<Link href="/signin" />}
          >
            Sign in
          </Button>
        </Card>
      )}

      {/* The anchors. Always visible, never collapsed. */}
      <div className="mt-2 flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <Row
            key={item.slug}
            item={item}
            active={
              item.href === "/home"
                ? pathname === "/home"
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            }
          />
        ))}
      </div>

      {/* The identity group sits first among the sections: play the War,
          collect the champions, own the relics. Sealed entries wear the same
          Soon badge as the chapters; their routes are live previews. */}
      <Section
        label="The Collection"
        items={collectionNav}
        pathname={pathname}
        defaultOpen
        storageKey="collection"
      />
      <Section
        label="The Realm"
        items={socialNav}
        pathname={pathname}
        defaultOpen
        storageKey="realm"
      />
      <Section
        label="Tools"
        items={toolsNav}
        pathname={pathname}
        defaultOpen={false}
        storageKey="tools"
      />
      <Section
        label="Account"
        items={accountNav}
        pathname={pathname}
        defaultOpen
        storageKey="account"
      />

      {isAdmin && (
        <Link
          href="/admin"
          className={`group mt-3 flex items-center gap-2.5 rounded-md py-[7px] pl-3 pr-2 text-[13px] transition-colors duration-150 ${
            pathname.startsWith("/admin")
              ? "bg-panel text-gold-bright"
              : "text-bone-mut hover:bg-panel/50 hover:text-bone"
          }`}
        >
          <Icon name="shield" className="h-[17px] w-[17px] shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">
            The Small Council
          </span>
          <span className="shrink-0 rounded-sm border border-gold/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-gold/70">
            Admin
          </span>
        </Link>
      )}

      <Section
        label="Chapters ahead"
        items={comingSoonNav.map((i) => ({ ...i, badge: "Soon" }))}
        pathname={pathname}
        defaultOpen={false}
        storageKey="chapters"
      />

      <div className="h-6" />
    </nav>
  );
}
