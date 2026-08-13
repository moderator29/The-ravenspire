import type { Metadata } from "next";
import {
  MERCER_SKUS,
  MERCER_CATEGORIES,
  type MercerSku,
} from "@/lib/collectibles/mercer";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { BackButton } from "@/components/shell/back-button";

export const metadata: Metadata = {
  title: "The Mercer",
  description:
    "The realm's official merch across four ranges, sealed until launch.",
};

/* THE MERCER (V2 Part Two, section 26.3). Plain label: official merch.
 *
 * Five SKUs, quality over catalog. Until physical samples are approved there
 * is no product photography, so there are no product photos: each piece
 * renders as a type-led plate, the kind word set large in the display face,
 * which is honest and deliberate rather than a placeholder image pretending
 * to be a product. No prices, sizes or stock counts, because none exist. */

function SkuCard({ sku }: { sku: MercerSku }) {
  return (
    <Card variant="default" radius="xl" pad="none" className="flex flex-col overflow-hidden">
      {/* The plate. Photography replaces this the day samples are approved. */}
      <div className="flex aspect-square items-center justify-center bg-[image:radial-gradient(70%_55%_at_50%_40%,rgba(217,176,64,0.10),transparent_72%)]">
        <span className="select-none font-display text-3xl font-semibold uppercase tracking-[0.18em] text-bone-faint/60">
          {sku.plate}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-steel-line p-4">
        <h2 className="font-display text-base font-semibold text-bone">
          {sku.name}
        </h2>
        <p className="text-xs leading-relaxed text-bone-mut">{sku.blurb}</p>
        <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 pt-1.5 text-[11px] font-semibold text-bone-faint">
          <Icon name="lock" className="h-3 w-3 text-gold" />
          Materials, sizes and pricing at launch
        </span>
      </div>
    </Card>
  );
}

export default function MercerPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
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
            properly: regalia to wear, gear for the table, emblems, and pieces
            for the hall. Every King&rsquo;s Reliquary ships with one inside.
            Photography arrives with the first approved samples; until then, the
            plates carry the plan.
          </p>
        </div>
        <NotifyMe feature="mercer" size="md" className="self-start" />
      </header>

      {MERCER_CATEGORIES.map((cat) => {
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
                <SkuCard key={sku.sku} sku={sku} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
