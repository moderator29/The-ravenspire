import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setOneCards, setOneCard, SET_ONE } from "@/lib/collectibles/set-one";
import { RARITY_SUPPLY } from "@/lib/commerce/catalog";
import { houses, sigilIcon } from "@/lib/data/houses";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import { ForgeCorners } from "@/components/ui/forge-frame";

/* THE COLLECTIBLE (V2 Part Two, section 31). The inner page of one Set One card.
 *
 * A collectibles surface, so this reads like one: the piece large in its forged
 * frame, then its authenticity and edition, its traits, its kit and its lore.
 * The mint cap per rarity is the real edition size from the server catalog, the
 * one number a collector most wants and the one a collectible platform must
 * never invent. Nothing here is owned or priced yet, because none of that
 * exists; the drop state is honest instead. */

export const dynamic = "force-static";

export function generateStaticParams() {
  return setOneCards.map((c) => ({ slug: c.champion.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = setOneCard(slug);
  if (!card) return { title: "The Reliquary" };
  return {
    title: `${card.champion.name} · Set One`,
    description: `${card.champion.title}. A ${card.champion.rarity} of ${card.champion.house}, card ${card.number} of ${SET_ONE.counts.total}.`,
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

const nfmt = new Intl.NumberFormat("en-US");

export default async function CollectiblePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = setOneCard(slug);
  if (!card) notFound();
  const c = card.champion;
  const sigil = houses.find((h) => h.name === c.house)
    ? sigilIcon[houses.find((h) => h.name === c.house)!.sigil] ?? "banner"
    : "banner";
  const edition = RARITY_SUPPLY[c.rarity as keyof typeof RARITY_SUPPLY];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        {/* One card's parent is the Reliquary it belongs to, not the Ravenry. */}
        <BackButton href="/reliquary" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* The piece, in its forged frame. */}
        <div className="mx-auto w-full max-w-[22rem] lg:sticky lg:top-4">
          <div
            className={`rarity-${c.rarity} relative aspect-[5/7] w-full overflow-hidden rounded-xl border border-gold/30 bg-void shadow-[0_18px_50px_-18px_rgba(0,0,0,0.8)]`}
          >
            {c.art ? (
              <Image
                src={c.art}
                alt={c.name}
                fill
                sizes="352px"
                priority
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[image:radial-gradient(80%_60%_at_50%_35%,rgba(217,176,64,0.08),transparent_70%)]">
                <Icon name={sigil} className="h-14 w-14 text-gold/40" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
                  Portrait incoming
                </span>
              </div>
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_46px_rgba(0,0,0,0.55)]"
            />
            {card.locked && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-obsidian/55 backdrop-blur-[2px]">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-gold/40 bg-obsidian/80">
                  <Icon name="lock" className="h-5 w-5 text-gold" />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-bone-mut">
                  Locked
                </span>
              </div>
            )}
            <ForgeCorners size="lg" />
          </div>
        </div>

        {/* The dossier. */}
        <div className="mt-5 flex flex-col gap-5 lg:mt-0">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name={sigil} className="h-4 w-4 text-gold" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
                {c.house} &middot; No. {card.number}/{SET_ONE.counts.total}
              </span>
            </div>
            <h1 className="gold-text font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {c.name}
            </h1>
            <p className="text-sm uppercase tracking-[0.16em] text-bone-mut">
              {c.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <RarityChip rarity={c.rarity}>{c.rarity}</RarityChip>
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] font-semibold " +
                  (card.locked
                    ? "border-steel-line bg-void/70 text-bone-faint"
                    : "border-gold/40 bg-gold/10 text-gold-bright")
                }
              >
                <Icon
                  name={card.locked ? "lock" : "spark"}
                  className="h-3 w-3"
                />
                {card.locked ? "Future drop" : "Genesis drop"}
              </span>
            </div>
          </header>

          {/* Authenticity and edition. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Trait label="Rarity" value={c.rarity} />
            <Trait label="Edition" value={`${nfmt.format(edition)} minted`} />
            <Trait label="Collector no." value={`${card.number} / ${SET_ONE.counts.total}`} />
            <Trait label="House" value={c.house.replace("House ", "")} />
            <Trait label="Weapon" value={c.weapon} />
            <Trait label="Class" value={c.weaponClass} />
          </div>

          {/* The collect state. Honest: nothing is priced or owned yet. */}
          <Card variant="warm" radius="xl" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="wallet" className="h-4 w-4 text-gold" />
              <h2 className="font-display text-base font-semibold text-bone">
                {card.locked ? "Held for a future drop" : "In the genesis drop"}
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-bone-mut">
              {card.locked
                ? "This card is part of Set One but is not in the current drop. It unlocks in a later wave. No card mints until the set is live, and every mint is announced first."
                : "This card is collectable in the first wave. At launch it is minted non-custodially to your own wallet when you open a Warchest. Owning the card is owning the champion."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <NotifyMe feature="reliquary" size="md" />
              {!card.locked && (
                <Link
                  href="/warchests"
                  className="inline-flex min-h-9 touch:min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-bone-mut transition-colors duration-fast hover:text-bone"
                >
                  <Icon name="coin" className="h-4 w-4 text-gold" />
                  Where it drops: the Warchests
                </Link>
              )}
            </div>
          </Card>

          {/* Stats, the trait grid a collector reads as power. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
              Field stats
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Trait label="Attack" value={nfmt.format(c.stats.attack)} />
              <Trait label="Defense" value={nfmt.format(c.stats.defense)} />
              <Trait label="Health" value={nfmt.format(c.stats.health)} />
              <Trait label="Speed" value={nfmt.format(c.stats.speed)} />
            </div>
          </section>

          {/* Kit. */}
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
              The kit
            </h2>
            <div className="flex flex-col gap-2.5">
              <div className="rounded-lg border border-steel-line bg-obsidian/40 p-3.5">
                <p className="flex items-center gap-2 font-display text-sm font-semibold text-bone">
                  <Icon name="shield" className="h-4 w-4 text-gold" />
                  {c.passive.name}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                    Passive
                  </span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                  {c.passive.desc}
                </p>
              </div>
              <div className="rounded-lg border border-steel-line bg-obsidian/40 p-3.5">
                <p className="flex items-center gap-2 font-display text-sm font-semibold text-bone">
                  <Icon name="spark" className="h-4 w-4 text-gold" />
                  {c.ultimate.name}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
                    Ultimate
                  </span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-bone-mut">
                  {c.ultimate.desc}
                </p>
              </div>
            </div>
          </section>

          {/* Lore. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
              Lore
            </h2>
            <p className="text-sm italic leading-relaxed text-bone-mut">
              {c.lore}
            </p>
          </section>

          <Link
            href={`/war/champions/${c.slug}`}
            className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-bone-mut transition-colors duration-fast hover:text-bone"
          >
            <Icon name="swords" className="h-4 w-4 text-gold" />
            Muster this champion in the War
          </Link>
        </div>
      </div>
    </div>
  );
}
