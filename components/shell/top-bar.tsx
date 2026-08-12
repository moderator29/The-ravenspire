"use client";

import Link from "next/link";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { RavenMark } from "@/components/brand/raven-mark";
import { SideNav } from "@/components/shell/side-nav";
import { NotifDot } from "@/components/notifications/notif-badge";
import { StreakFlame } from "@/components/shell/streak-flame";

/* Mobile only top bar: drawer trigger, centred brand, ravens and whispers.
   The vault lives in the side nav and bottom nav, so the bar stays clean and
   the mark sits centred.
 *
 * Two things were wrong here and both mattered most on the one device this bar
 * exists for.
 *
 * Every control was 36px square. This bar renders below lg and nowhere else,
 * so every one of its targets was under the 44px minimum on the only screens
 * that ever see it. They are size lg now, which lands exactly on 44px.
 *
 * The drawer was a fixed overlay with a bare backdrop button: no dialog role,
 * no aria-modal, no focus trap, no focus restore and no Escape handling. Tab
 * from inside it walked straight into the page behind. It is now the Sheet
 * primitive anchored left, which carries all of that. */
export function TopBar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-steel-line/70 bg-obsidian/92 px-3 backdrop-blur-xl lg:hidden">
        <IconButton
          icon="user"
          label="Open menu"
          size="lg"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        />
        {/* The mark stays 32px, the target does not.

            This link measured 64 square until the spacing scale stopped
            redefining `h-8`, which is to say it cleared the 44px floor for the
            wrong reason and would have failed the moment that was fixed. A
            brand mark should not grow to 44px, so the link is a 44px box with
            a 32px mark centred in it: the eye sees the mark, the thumb gets
            the floor. */}
        <Link
          href="/home"
          aria-label="The Ravenry"
          className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center"
        >
          <RavenMark className="h-8 w-8" />
        </Link>
        <div className="flex items-center gap-1">
          <StreakFlame />
          {/* IconButton takes no children by design, so the unread dot is a
              sibling positioned over it rather than nested inside. The wrapper
              is pointer-events-none on the dot so it never eats the tap. */}
          <span className="relative inline-flex">
            <IconButton
              icon="bell"
              label="Ravens"
              size="lg"
              render={<Link href="/ravens" />}
            />
            <NotifDot className="pointer-events-none absolute right-2 top-2" />
          </span>
          <IconButton
            icon="mail"
            label="Whispers"
            size="lg"
            render={<Link href="/whispers" />}
          />
        </div>
      </header>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="Menu"
        className="lg:hidden"
      >
        <SideNav onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
