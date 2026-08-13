import type { Metadata } from "next";
import { CHEST_TIERS, type ChestTier } from "@/lib/collectibles/warchests";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { NotifyMe } from "@/components/realm/notify-me";
import { FairnessPanel } from "@/components/collectibles/fairness-panel";
import { BackButton } from "@/components/shell/back-button";

export const metadata: Metadata = {
  title: "Warchests",
  description:
    "Mystery boxes of the realm. Exact odds printed on every chest, sealed until launch.",
};

/* WARCHESTS (V2 Part Two, section 26.2). Plain label: mystery boxes.
 *
 * Three tiers, sealed until launch. The odds tables stay crisp and readable
 * on purpose: printed odds are the trust feature of the whole program
 * (section 34), so they are the one thing this preview never blurs. What is
 * locked is the opening, and the lock says so plainly instead of pretending
 * a purchase exists.
 *
 * Every number on this page is the planned specification from
 * lib/collectibles/warchests.ts, validated at build time to sum to 100, and
 * labeled as planned. No prices, because none exist. */

function OddsTable({ tier }: { tier: ChestTier }) {
  const rows = [
    ["Rare", tier.odds.rare],
    ["Epic", tier.odds.epic],
    ["Legendary", tier.odds.legendary],
    ["Mythic", tier.odds.mythic],
  ] as const;

  return (
    <div className="rounded-lg border border-steel-line bg-obsidian/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        Odds per card &middot; planned, final before launch
      </p>
      <dl className="mt-2 flex flex-col gap-1.5">
        {rows.map(([label, pct]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-bone-mut">{label}</dt>
            <dd className="tnum text-xs font-semibold text-bone">{pct}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TierCard({ tier }: { tier: ChestTier }) {
  return (
    <Card variant={tier.kind === "physical" ? "warm" : "default"} radius="xl" className="flex flex-col gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
          {tier.kind === "physical" ? "Physical box" : "Digital chest"} &middot; {tier.plain}
        </p>
        <h2 className="gold-text mt-1 font-display text-xl font-semibold">
          {tier.name}
        </h2>
      </div>

      <ul className="flex flex-col gap-1.5">
        {tier.contents.map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm text-bone-mut">
            <Icon name="coin" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            {line}
          </li>
        ))}
      </ul>

      <OddsTable tier={tier} />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-bone">
        <Icon name="medal" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        {tier.guarantee}
      </p>

      {/* The lock, not a dead buy button. A purchase that does not exist is
          not rendered as one. */}
      <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 text-[11px] font-semibold text-bone-faint">
        <Icon name="lock" className="h-3 w-3 text-gold" />
        Opens at launch
      </span>
    </Card>
  );
}

export default function WarchestsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex">
        <BackButton />
      </div>

      <header className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            Warchests &middot; Mystery boxes
          </p>
          <h1 className="gold-text mt-1.5 font-display text-2xl font-semibold sm:text-3xl">
            Every chest prints its odds
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bone-mut">
            Digital chests open into Set One cards. The physical box ships
            official merch, printed cards, and a single-use code that mints
            the digital twins to your own wallet. The realm never holds your
            keys, and a chest never hides its odds.
          </p>
        </div>
        <NotifyMe feature="warchests" size="md" className="self-start" />
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {CHEST_TIERS.map((tier) => (
          <TierCard key={tier.sku} tier={tier} />
        ))}
      </div>

      {/* The fairness contract, on the page that makes the promise. It is
          deliberately not behind the launch flag: a member is entitled to hold
          the realm to its word before the chests open and long after, and the
          honesty of the scheme depends on the commitment existing early.
          Their own live commitment, real, never a specimen. */}
      <FairnessPanel />

      <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
        Prices are set and stay off this page until the realm is ready to take
        payment. Odds are the planned specification and are final before launch;
        every chest carries its guarantee in writing. Chest openings settle on
        the server, and every pull is auditable.
      </p>
    </div>
  );
}
