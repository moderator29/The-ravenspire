import type { Metadata } from "next";
import Link from "next/link";
import {
  MERCER_SKUS,
  MERCER_CATEGORIES,
  type MercerSku,
} from "@/lib/collectibles/mercer";
import { getFlag } from "@/lib/flags";
import { pricesConfirmed } from "@/lib/commerce/catalog";
import { Icon } from "@/components/ui/icon";
import {
  ForgeCorners,
  ForgeTicks,
  ForgeHairline,
} from "@/components/ui/forge-frame";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import { MercerStore } from "@/components/commerce/mercer-store";

/* Range label for the info panel, so a card names its range plainly. */
const RANGE_LABEL = new Map(
  MERCER_CATEGORIES.map((c) => [c.key, c.label] as const)
);

export const metadata: Metadata = {
  title: "The Mercer",
  description:
    "The realm's official merch across two ranges: regalia to wear and gear for the table.",
};

/* Flag-dependent: read the chapter flag and the price gate at request time, so
   opening day is a flag flip and not a deploy, the same posture as the
   Warchests. */
export const dynamic = "force-dynamic";

/* THE MERCER (V2 Part Two, section 26.3). Plain label: official merch.
 *
 * Fourteen launch pieces across two ranges, the Regalia and the Table, each
 * shown with its real product render (public/brand/merch), obsidian and forged
 * gold throughout. Two independent switches gate the buy flow: the chapter flag
 * (mercer_live) and the price confirmation gate, exactly the pair the checkout
 * route enforces. While either is off the page stays a sealed preview, and no
 * price is rendered because none is exposed to a client surface (rule 4). */

/* One preview piece, two stacked containers drawn from the reference card: a
   forged-gold framed product shot over an obsidian-and-gold info plate. The
   whole tile is a link into the piece's own inner page, and it lifts on hover,
   transform only. No price appears, because none is exposed to a client surface
   (rule 4); the plate carries the range and a launch note instead. */
function PreviewCard({ sku }: { sku: MercerSku }) {
  return (
    <Link
      href={`/mercer/${sku.sku}`}
      aria-label={`${sku.name}. ${sku.blurb} Open the piece.`}
      className="group flex flex-col gap-2 rounded-lg outline-none transition-transform duration-fast ease-out-quint hover:-translate-y-1 focus-visible:-translate-y-1"
    >
      {/* The product shot, framed in forged gold. No text on the art. */}
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gold/25 bg-void shadow-[0_10px_28px_-12px_rgba(0,0,0,0.75)] transition-colors duration-fast group-hover:border-gold/55">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(70%_55%_at_50%_42%,rgba(217,176,64,0.10),transparent_72%)]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sku.art}
          alt=""
          draggable={false}
          className="relative h-full w-full object-contain p-3"
          style={{ filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_38px_rgba(0,0,0,0.55)]"
        />
        <ForgeCorners />
        <ForgeTicks />
      </div>

      {/* The info plate. Name on its own line, then the range and a launch note. */}
      <div className="relative overflow-hidden rounded-md border border-gold/25 bg-gradient-to-b from-panel-warm to-void px-3 py-2.5 transition-colors duration-fast group-hover:border-gold/50">
        <ForgeHairline />
        <span className="gold-text block font-display text-sm font-semibold leading-tight">
          {sku.name}
        </span>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-steel-line/70 pt-1.5">
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-faint">
            {RANGE_LABEL.get(sku.category) ?? "The Mercer"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
            <Icon name="lock" className="h-2.5 w-2.5 text-gold" />
            At launch
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function MercerPage() {
  const [live, confirmed] = await Promise.all([
    getFlag("mercer_live"),
    Promise.resolve(pricesConfirmed()),
  ]);
  const open = live && confirmed;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        <BackButton />
      </div>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            The Mercer &middot; Official merch
          </p>
          <h1 className="gold-text mt-1.5 font-display text-2xl font-semibold sm:text-3xl">
            The realm, worn and displayed
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bone-mut">
            The realm&rsquo;s official merch, made in small runs and made
            properly: regalia to wear and gear for the table, obsidian and
            forged gold throughout. Every King&rsquo;s Reliquary ships with one
            inside.
          </p>
        </div>
        {!open && (
          <NotifyMe feature="mercer" size="md" className="self-start" />
        )}
      </header>

      {open ? (
        <MercerStore skus={MERCER_SKUS} />
      ) : (
        MERCER_CATEGORIES.map((cat) => {
          const items = MERCER_SKUS.filter((s) => s.category === cat.key);
          if (items.length === 0) return null;
          return (
            <section key={cat.key} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-steel-line pb-2">
                <h2 className="gold-text font-display text-lg font-semibold">
                  {cat.label}
                </h2>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
                  {cat.plain}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {items.map((sku) => (
                  <PreviewCard key={sku.sku} sku={sku} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
        {open
          ? "Your exact total is confirmed at secure checkout. Every piece is made to order in a small run, and every payment settles in crypto to a non-custodial wallet."
          : "Prices do not exist on this page yet, so none are shown. Every piece is made to order in small runs; sizes and pricing arrive at launch."}
      </p>
    </div>
  );
}
