import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { Icon3D } from "@/components/ui/icon-3d";
import { BackButton } from "@/components/shell/back-button";
import { comingSoonNav, findComingSoon } from "@/lib/nav";
import { NotifyMe } from "@/components/realm/notify-me";
import { isInterestFeature } from "@/lib/realm/interest";

export function generateStaticParams() {
  return comingSoonNav.map((i) => ({ slug: i.slug }));
}

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = findComingSoon(slug);
  if (!item) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-6 text-center">
      <div className="w-full max-w-md self-center">
        <BackButton />
      </div>
      <Card pad="none" className="mt-6 flex w-full max-w-md flex-col items-center p-8">
        {/* "Chapter II" was hardcoded, so all six chapters announced themselves
            as the second one. Nothing in comingSoonNav carries a chapter
            number, and inventing one for each would be inventing data. The
            realm already has a true name for this set: the navigation calls it
            Chapters ahead, and that is what every one of these pages is. */}
        <span className="hairline mb-5 rounded-sm bg-panel-warm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">
          Chapters ahead
        </span>
        <Icon3D name={item.icon3d} size="hero" priority />
        <p className="mt-5 text-xs uppercase tracking-[0.3em] text-bone-faint">
          {item.plain} · Coming soon
        </p>
        <h1 className="gold-text mt-2 font-display text-3xl font-semibold tracking-wide sm:text-4xl">
          {item.themed}
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-bone-mut">
          {item.blurb}
        </p>
        {/* This button used to link to /ravens and register nothing, which was
            a promise it did not keep (a recorded defect). It now writes to the
            interest table through the same control the LockedGate uses, keyed
            by the chapter's own slug; every chapter slug is on the explicit
            allowlist in lib/realm/interest.ts. The guard is for a slug that
            has fallen off that list: no button is honest, a dead one is not. */}
        {isInterestFeature(item.slug) ? (
          <NotifyMe feature={item.slug} size="lg" className="mt-7" />
        ) : null}
        <p className="mt-3 text-[11px] text-bone-faint">
          A raven will find you the day this chapter opens.
        </p>
      </Card>
    </div>
  );
}
