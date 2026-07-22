import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { comingSoonNav, findComingSoon } from "@/lib/nav";

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
      <div className="glass mt-6 flex w-full max-w-md flex-col items-center p-8">
        <span className="hairline mb-5 rounded-full bg-panel-warm px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-gold">
          Chapter II
        </span>
        <div className="glass glass-sm flex h-16 w-16 items-center justify-center text-gold">
          <Icon name={item.icon} className="h-8 w-8" />
        </div>
        <p className="mt-5 text-xs uppercase tracking-[0.3em] text-bone-faint">
          {item.plain} · Coming soon
        </p>
        <h1 className="gold-text mt-2 font-display text-3xl font-semibold tracking-wide sm:text-4xl">
          {item.themed}
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-bone-mut">
          {item.blurb}
        </p>
        <Link href="/ravens" className="btn-gold mt-7 px-6 py-2.5 text-sm">
          Notify me
        </Link>
        <p className="mt-3 text-[11px] text-bone-faint">
          A raven will find you the day this chapter opens.
        </p>
      </div>
    </div>
  );
}
