import { Feed } from "@/components/social/feed";
import { TourMount } from "@/components/onboarding/tour-mount";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-1 font-display text-xl font-semibold text-bone">
        The Ravenry
      </h1>
      <p className="mb-4 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Feed · home
      </p>
      <TourMount />
      <Feed />
    </div>
  );
}
