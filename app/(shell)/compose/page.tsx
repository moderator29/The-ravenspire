import { Composer } from "@/components/social/composer";

/*
  The dedicated compose screen. Like X's compose, the whole surface is given
  over to writing a single raven: a top bar with a way out and a prominent
  Send raven, the author's avatar, and a large textarea. Every composer
  feature travels with it (images, polls, the Herald's suggestion, audience).
  On a successful send the Composer routes back to /home, where the feed
  reloads on mount and surfaces the new raven.

  Sealing a Call has its own page now, /calls/new, reached from the same
  speed dial this page is (components/shell/floating-compose.tsx): a Call is
  the realm's flagship, not a toggle inside a raven, and it needs its own
  room for the difficulty preview and stake window CallForm draws.
*/
export default function ComposePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Composer page />
    </div>
  );
}
