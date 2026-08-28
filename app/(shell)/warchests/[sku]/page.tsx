import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import { ForgeCorners } from "@/components/ui/forge-frame";

/* THE CHEST (V2 Part Two, section 26.2). The inner page of one Warchest.
 *
 * A collectible box read like one: the chest large in its forged frame, then
 * the two things that make it trustworthy rather than a gamble, the exact odds
 * and the written guarantee, then what it holds and how the opening proves
 * itself. Every number is the planned specification from
 * lib/collectibles/warchests.ts, validated at build to sum to 100. No price,
 * because none exists yet; the opening is sealed until launch and says so. */

export const dynamic = "force-static";

export function generateStaticParams() {
  return CHEST_TIERS.map((t) => ({ sku: t.sku }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) return { title: "Warchests" };
  return {
    title: `${tier.name} · Warchests`,
    description: `${tier.plain}. ${tier.guarantee}. Exact odds printed, sealed until launch.`,
  };
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
        {label}
      </span>
      <span className="truncate text-sm font-semibold text-bone">{value}</span>
    </div>
  );
}

const ODDS_ROWS = ["rare", "epic", "legendary", "mythic"] as const;
const ODDS_LABEL: Record<(typeof ODDS_ROWS)[number], string> = {
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

export default async function ChestPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const tier = CHEST_TIERS.find((t) => t.sku === sku);
  if (!tier) notFound();
  const physical = tier.kind === "physical";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        {/* One chest's parent is the shelf it sits on, not the Ravenry. Only
            the floor changes: a member who walked here still retraces. */}
        <BackButton href="/warchests" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* The chest, in its forged frame. */}
        <div className="mx-auto w-full max-w-[22rem] lg:sticky lg:top-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gold/30 bg-[image:radial-gradient(70%_60%_at_50%_45%,rgba(217,176,64,0.08),transparent_72%)] bg-void shadow-[0_18px_50px_-18px_rgba(0,0,0,0.8)]">
            <Image
              src={tier.art.closed}
              alt={tier.name}
              fill
              sizes="352px"
              priority
              className="object-contain p-7"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_46px_rgba(0,0,0,0.5)]"
            />
            <ForgeCorners size="lg" />
          </div>
        </div>

        {/* The dossier. */}
        <div className="mt-5 flex flex-col gap-5 lg:mt-0">
          <header className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
              {physical ? "Physical box" : "Digital chest"} &middot; {tier.plain}
            </p>
            <h1 className="gold-text font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {tier.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold-bright">
                <Icon name="medal" className="h-3 w-3" />
                {physical ? "Ships a box" : "Opens in the app"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-steel-line bg-void/70 px-2.5 py-1 text-[11px] font-semibold text-bone-faint">
                <Icon name="lock" className="h-3 w-3 text-gold" />
                Sealed until launch
              </span>
            </div>
          </header>

          {/* The traits a buyer weighs. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Trait label="Format" value={physical ? "Physical" : "Digital"} />
            <Trait label="Cards" value={`${tier.cardCount} per chest`} />
            <Trait label="Floor" value={ODDS_LABEL[tier.floor]} />
            <Trait label="Set" value="Set One" />
          </div>

          {/* The odds, the trust feature: printed, never blurred. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
              Odds per card &middot; planned, final before launch
            </h2>
            <div className="overflow-hidden rounded-lg border border-steel-line bg-obsidian/50">
              {ODDS_ROWS.map((r) => (
                <div
                  key={r}
                  className="flex items-center justify-between gap-3 border-b border-steel-line/60 px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-sm text-bone-mut">{ODDS_LABEL[r]}</span>
                  <span className="tnum text-sm font-semibold text-bone">
                    {tier.odds[r]}%
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* The written guarantee. */}
          <Card variant="warm" radius="xl" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="medal" className="h-4 w-4 text-gold" />
              <h2 className="font-display text-base font-semibold text-bone">
                The guarantee
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-bone">{tier.guarantee}</p>
            <p className="text-xs leading-relaxed text-bone-mut">
              Every chest carries its guarantee in writing, the odds are printed
              on the box, and every opening settles on the server where the pull
              can be verified. The realm never holds your keys.
            </p>
          </Card>

          {/* What one chest holds. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
              What it holds
            </h2>
            <ul className="flex flex-col gap-2">
              {tier.contents.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2.5 text-sm text-bone-mut"
                >
                  <Icon
                    name="coin"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold"
                  />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          {/* The collect state. Honest: nothing is priced or opened yet. */}
          <Card variant="raised" radius="xl" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="wallet" className="h-4 w-4 text-gold" />
              <h2 className="font-display text-base font-semibold text-bone">
                Opens at launch
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-bone-mut">
              {physical
                ? "The box ships official merch, printed cards, and a single-use code that mints the digital twins to your own wallet. Pricing and checkout open at launch."
                : "This chest opens into Set One cards, minted non-custodially to your own wallet. Pricing and checkout open at launch."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <NotifyMe feature="warchests" size="md" />
              <Link
                href="/warchests"
                className="inline-flex min-h-9 touch:min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-bone-mut transition-colors duration-fast hover:text-bone"
              >
                <Icon name="chevron-left" className="h-4 w-4 text-gold" />
                Back to all chests
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
