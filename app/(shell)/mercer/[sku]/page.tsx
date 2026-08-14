import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MERCER_SKUS,
  MERCER_CATEGORIES,
} from "@/lib/collectibles/mercer";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ForgeCorners } from "@/components/ui/forge-frame";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";

/* THE MERCER, one piece (V2 Part Two, section 26.3). The inner page of a merch
 * product, mirroring the Reliquary collectible page so a framed piece reads the
 * same wherever it appears.
 *
 * The piece large in its forged frame, then its plain details, then an honest
 * collect state: every piece is made to order in a small run and ships
 * worldwide, and pricing and checkout open at launch. NO PRICE is rendered
 * here, because prices live server-only in lib/commerce/catalog.ts and never
 * reach a client surface (rule 4, real-data-only). Nothing is priced or
 * sellable until the store is unsealed. */

export const dynamic = "force-static";

export function generateStaticParams() {
  return MERCER_SKUS.map((s) => ({ sku: s.sku }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const piece = MERCER_SKUS.find((s) => s.sku === sku);
  if (!piece) return { title: "The Mercer" };
  return {
    title: `${piece.name} · The Mercer`,
    description: piece.blurb,
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

/* A kind is stored as a slug (tee, deck-box, long-sleeve); the page reads it as
   words. Honest and generic: no materials or sizes are invented. */
function readKind(kind: string): string {
  return kind
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function MercerPiecePage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const piece = MERCER_SKUS.find((s) => s.sku === sku);
  if (!piece) notFound();

  const category = MERCER_CATEGORIES.find((c) => c.key === piece.category);
  const range = category?.label ?? "The Mercer";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        <BackButton href="/mercer" />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* The piece, in its forged frame. A product shot on obsidian, so it is
            contained with air around it and never cropped. No text on the art. */}
        <div className="mx-auto w-full max-w-[22rem] lg:sticky lg:top-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gold/30 bg-void shadow-[0_18px_50px_-18px_rgba(0,0,0,0.8)]">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(70%_55%_at_50%_42%,rgba(217,176,64,0.10),transparent_72%)]"
            />
            <Image
              src={piece.art}
              alt={piece.name}
              fill
              sizes="352px"
              priority
              className="object-contain p-6"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_46px_rgba(0,0,0,0.55)]"
            />
            <ForgeCorners size="lg" />
          </div>
        </div>

        {/* The dossier. */}
        <div className="mt-5 flex flex-col gap-5 lg:mt-0">
          <header className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
              {range} &middot; {category?.plain ?? "Official merch"}
            </span>
            <h1 className="gold-text font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {piece.name}
            </h1>
            <p className="text-sm leading-relaxed text-bone-mut">
              {piece.blurb}
            </p>
          </header>

          {/* The plain details, honest and generic. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Trait label="Range" value={range} />
            <Trait label="Kind" value={readKind(piece.kind)} />
            <Trait label="Made to order" value="Small run" />
            <Trait label="Ships" value="Worldwide" />
          </div>

          {/* The collect state. Honest: nothing is priced until launch. */}
          <Card variant="warm" radius="xl" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="spark" className="h-4 w-4 text-gold" />
              <h2 className="font-display text-base font-semibold text-bone">
                Made to order
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-bone-mut">
              Every piece is made in a small run and ships worldwide, obsidian
              and forged gold, made properly. Sizes, pricing and checkout open
              at launch. The store is sealed until then, so no price is shown
              here.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <NotifyMe feature="mercer" size="md" />
              <Link
                href="/mercer"
                className="inline-flex min-h-9 touch:min-h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-bone-mut transition-colors duration-fast hover:text-bone"
              >
                <Icon name="chevron-right" className="h-4 w-4 text-gold" />
                Browse the full Mercer
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
