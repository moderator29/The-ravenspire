"use client";

import Link from "next/link";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SideNav } from "@/components/shell/side-nav";
import { NotifDot } from "@/components/notifications/notif-badge";
import { StreakFlame } from "@/components/shell/streak-flame";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";

/* Mobile only top bar: drawer trigger, profile, ravens and whispers. The
   vault lives in the side nav, so the bar stays clean without a brand mark
   spending a cluster of its own on a destination two other controls already
   reach.

   SEARCH LEFT. Its trigger doubled as the drawer opener's neighbour and the
   glyph in that seat was `user`, which reads as a profile shortcut and does
   not open one: it opens the menu. A member looking for their own Keep tapped
   it expecting a profile and got a drawer instead. The seat now carries the
   member's own portrait and goes to `/keep` directly, and the drawer trigger
   carries its own honest glyph, `menu`, three lines, nothing else. Global
   search still has its place inside the Crossroads; it does not need a
   permanent seat in the one bar that has to fit a menu and a profile in a
   phone's width.

   THE CENTRED MARK IS GONE. It used to sit as its own 44px target between the
   two clusters, but the dock already carries The Ravenry as its first
   destination and the drawer opens onto the same nav, so the mark was a third
   way to reach a page two other controls already reach, on the one bar in the
   product with the least room to spend on it. Left cluster ends at 100 and
   right cluster starts at 214 on a 366px screen: unchanged, because removing
   the middle element moves neither end, it only leaves the space between
   them open rather than spent on a logo.

   THE MENU TRIGGER SITS IN A SMALL GLASS FRAME NOW, the same restrained
   recipe the `glass` Button variant and the dock use: `bg-void/60`, a 10px
   blur, the soft warm gradient wash. The frame is a few pixels larger than
   the glyph on every side and purely decorative; the `IconButton` underneath
   is untouched, still the full 44px target, because a frame that exists only
   to be looked at does not get to shrink the thing a thumb has to land on.

   THE BELL AND MAIL SIT CLOSER TOGETHER NOW. They used to share the right
   cluster's own `gap-1` with the streak flame, which read as three evenly
   spaced items when Ravens and Whispers are the same kind of thing, a realm
   inbox, and the streak is not. Nesting the pair in their own row at
   `gap-0.5` groups them visually without touching either control's own 44px
   box or its distance from the streak.
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
          <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
            {/* Decorative only: the glass read around the glyph. The real
                44px target is the IconButton drawn on top of it, unchanged. */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-8 w-8 rounded-md border border-gold/15 bg-void/60 backdrop-blur-[10px] bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(12,12,17,0.4))]"
            />
            <IconButton
              icon="menu"
              label="Open menu"
              size="lg"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            />
          </span>
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
        <div className="flex items-center gap-1">
          <StreakFlame />
          {/* Ravens and Whispers, nested in their own row at a tighter gap
              than the streak sits from them: two seats of the same kind of
              thing, a realm inbox, read as a pair rather than a third evenly
              spaced item. IconButton takes no children by design, so the
              unread dot is a sibling positioned over it rather than nested
              inside; the wrapper stays pointer-events-none so it never eats
              the tap. */}
          <div className="flex items-center gap-0.5">
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
        </div>
      </header>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="Menu"
        /* Reads as the realm's own navigation, obsidian rather than the
           lighter panel shade every other sheet in the product uses. See
           `SURFACE_TONE` in components/ui/sheet.tsx. */
        surface="obsidian"
        className="lg:hidden"
      >
        <SideNav onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
