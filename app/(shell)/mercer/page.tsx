import type { Metadata } from "next";
import {
  MERCER_SKUS,
  MERCER_CATEGORIES,
  type MercerSku,
} from "@/lib/collectibles/mercer";
import { getFlag } from "@/lib/flags";
import { pricesConfirmed } from "@/lib/commerce/catalog";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";
import { MercerStore } from "@/components/commerce/mercer-store";

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

function PreviewCard({ sku }: { sku: MercerSku }) {
  return (
    <Card
      variant="default"
      radius="xl"
      pad="none"
      className="flex flex-col overflow-hidden"
    >
      <div className="flex aspect-square items-center justify-center bg-[image:radial-gradient(70%_55%_at_50%_42%,rgba(217,176,64,0.10),transparent_72%)]">
        {/* The product render on obsidian; its dark ground blends into the
            card. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sku.art}
          alt={sku.name}
          draggable={false}
          className="h-full w-full object-contain p-3"
          style={{ filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))" }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-steel-line p-4">
        <h2 className="font-display text-base font-semibold text-bone">
          {sku.name}
        </h2>
        <p className="text-xs leading-relaxed text-bone-mut">{sku.blurb}</p>
        <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 text-[11px] font-semibold text-bone-faint">
          <Icon name="lock" className="h-3 w-3 text-gold" />
          Sizes and pricing at launch
        </span>
      </div>
    </Card>
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
