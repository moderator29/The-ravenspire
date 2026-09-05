"use client";

import Link from "next/link";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { RavenMark } from "@/components/brand/raven-mark";
import { SideNav } from "@/components/shell/side-nav";
import { NotifDot } from "@/components/notifications/notif-badge";
import { StreakFlame } from "@/components/shell/streak-flame";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";

/* Mobile only top bar: drawer trigger, centred brand, profile, ravens and
   whispers. The vault lives in the side nav, so the bar stays clean and the
   mark sits centred.

   SEARCH LEFT. Its trigger doubled as the drawer opener's neighbour and the
   glyph in that seat was `user`, which reads as a profile shortcut and does
   not open one: it opens the menu. A member looking for their own Keep tapped
   it expecting a profile and got a drawer instead. The seat now carries the
   member's own portrait and goes to `/keep` directly, and the drawer trigger
   carries its own honest glyph, `menu`, three lines, nothing else. Global
   search still has its place inside the Crossroads; it does not need a
   permanent seat in the one bar that has to fit a brand mark, a menu and a
   profile in a phone's width.

   Left cluster ends at 100, the mark's middle 44px runs 161 to 205 on a
   366px screen, right cluster starts at 214: unchanged, because the cluster
   is still two 44px targets plus a 4px gap, only the second glyph and its
   destination changed.
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
  const { authenticated, avatarUrl } = useRealmAuth();

  return (
    <>
      {/* z-sticky, off the raw number it carried. The bar is page chrome that
          content scrolls under, which is exactly what the sticky rung is for;
          at a raw 40 it also sat above rungs it has no business beating. */}
      <header className="sticky top-0 z-sticky flex h-14 items-center justify-between border-b border-steel-line/70 bg-obsidian/92 px-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-1">
          <IconButton
            icon="menu"
            label="Open menu"
            size="lg"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          />
          {authenticated ? (
            <Link
              href="/keep"
              aria-label="Your Keep"
              className="flex h-11 w-11 shrink-0 items-center justify-center"
            >
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full border border-steel-line object-cover"
                />
              ) : (
                <span className="hairline flex h-8 w-8 items-center justify-center rounded-full bg-void text-bone-mut">
                  <Icon name="user" className="h-4 w-4" />
                </span>
              )}
            </Link>
          ) : (
            <IconButton
              icon="user"
              label="Sign in"
              size="lg"
              render={<Link href="/signin" />}
            />
          )}
        </div>
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
