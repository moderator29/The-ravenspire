import { Suspense } from "react";
import { Feed } from "@/components/social/feed";
import { TourMount } from "@/components/onboarding/tour-mount";
import { HeraldDigest } from "@/components/raven/digest-card";
import { RealmStrip } from "@/components/social/realm-strip";
import { StreamColumn } from "@/components/stream/stream-shell";
import { SeasonZeroBanner } from "@/components/season-zero/banner";
import { PumpFunBadge } from "@/components/dashboard/pump-fun-badge";
import { getFlag } from "@/lib/flags";

/* The Ravenry.
 *
 * This page was seventeen lines while /swap was over eleven hundred, which is
 * the V2 problem stated in two numbers: the heart of the realm was the thinnest
 * surface in it.
 *
 * It is now a dashboard that happens to contain a feed. The strip and the
 * digest below it now share one gap instead of each carrying its own margin,
 * so "is something happening" and "what happened while I was gone" read as
 * one instrument rather than two boxes that happen to sit near each other.
 * Both stay quiet by design: this is the Ledger register, so the ravens
 * remain the loudest thing on the page. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  /* The archive switch. Fails closed (lib/flags.ts), so an unset key hides
     the banner, matching the round's own sealed state on its page. */
  const seasonZeroLive = await getFlag("season_zero_live");

  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-3 font-display text-xl font-semibold tracking-tight text-bone">
        The Ravenry
      </h1>
      <TourMount />
      {/* The Pump.fun status, one quiet line above the feed. */}
      <PumpFunBadge />
      {/* The founding round's one line above the feed. Phase aware, Ledger
          register, and it removes itself when the round closes or is
          archived. */}
      {seasonZeroLive ? <SeasonZeroBanner /> : null}
      {/* The dashboard cluster. The strip answers "is something happening";
          the digest answers "what happened while I was gone", and it renders
          nothing at all when the answer is nothing. A single shared gap, not
          each component's own margin, is what makes the two read as one
          instrument instead of a stack of independently spaced boxes. */}
      <div className="mb-3 flex flex-col gap-2">
        <RealmStrip />
        <HeraldDigest />
      </div>
      {/* The Feed reads the view out of the query string so the dock's
          contextual strip actually drives it, and useSearchParams() opts a
          component out of static rendering. Without this boundary the whole
          page fails to prerender at build time, which is precisely the break
          that made this repository grow a CI pipeline in the first place. */}
      <Suspense fallback={null}>
        <Feed />
      </Suspense>
    </StreamColumn>
  );
}
