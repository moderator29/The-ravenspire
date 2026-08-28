import { Suspense } from "react";
import { Feed } from "@/components/social/feed";
import { TourMount } from "@/components/onboarding/tour-mount";
import { HeraldDigest } from "@/components/raven/digest-card";
import { RealmStrip } from "@/components/social/realm-strip";
import { StreamColumn } from "@/components/stream/stream-shell";
import { SeasonZeroBanner } from "@/components/season-zero/banner";

/* The Ravenry.
 *
 * This page was seventeen lines while /swap was over eleven hundred, which is
 * the V2 problem stated in two numbers: the heart of the realm was the thinnest
 * surface in it.
 *
 * It is now a dashboard that happens to contain a feed. The strip above answers
 * "is something happening, and am I in it" before a member scrolls, and the
 * composer sits in the feed rather than behind a floating button and a
 * navigation. Both are quiet by design: this is the Ledger register, so the
 * ravens stay the loudest thing on the page. */
export default function HomePage() {
  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-3 font-display text-xl font-semibold text-bone">
        The Ravenry
      </h1>
      <TourMount />
      {/* The founding round's one line above the feed. Phase aware, Ledger
          register, and it removes itself when the round closes. */}
      <SeasonZeroBanner />
      <RealmStrip />
      {/* Below the strip and above the feed. The strip answers "is something
          happening"; the digest answers "what happened while I was gone", and
          it renders nothing at all when the answer is nothing. */}
      <HeraldDigest />
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
