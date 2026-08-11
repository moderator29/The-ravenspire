import { Feed } from "@/components/social/feed";
import { TourMount } from "@/components/onboarding/tour-mount";
import { RealmStrip } from "@/components/social/realm-strip";

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
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-3 font-display text-xl font-semibold text-bone">
        The Ravenry
      </h1>
      <TourMount />
      <RealmStrip />
      <Feed />
    </div>
  );
}
