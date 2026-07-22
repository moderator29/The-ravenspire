"use client";

import { legendaryWeapons } from "@/lib/game/arsenal";
import { gearCatalog } from "@/lib/game/gear";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";

export default function ArsenalPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4">
        <BackButton href="/war" />
      </div>
      <h1 className="gold-text font-display text-3xl font-semibold">
        The Arsenal
      </h1>
      <p className="mt-1 text-sm text-bone-mut">
        Legendary weapons of the realm. Every blade here has a story, and most
        of the stories end badly for someone else.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {legendaryWeapons.map((w) => (
          <div
            key={w.slug}
            className={`rarity-${w.rarity} rarity-frame glass-warm overflow-hidden`}
          >
            {w.art ? (
              <div className="relative aspect-square w-full overflow-hidden">
                <img
                  src={w.art}
                  alt={w.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-void">
                <Icon name="swords" className="h-10 w-10 text-bone-faint" />
              </div>
            )}
            <div className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-semibold text-bone">
                  {w.name}
                </span>
                <span className={`rarity-${w.rarity} rarity-chip capitalize`}>
                  {w.rarity}
                </span>
              </div>
              <div className="mt-0.5 text-xs capitalize text-bone-faint">
                {w.class}
              </div>
              <p className="mt-2 text-sm text-bone-mut">{w.effect}</p>
              <p className="mt-2 text-xs italic leading-relaxed text-bone-faint">
                {w.lore}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold text-bone">
        Gear of the realm
      </h2>
      <p className="mt-1 text-sm text-bone-mut">
        Every slot a champion can fill, from crown to boot.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {gearCatalog.map((g) => (
          <div
            key={g.slug}
            className={`rarity-${g.rarity} rarity-frame glass-sm overflow-hidden rounded-2xl bg-panel`}
            title={g.effect}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.art}
              alt={g.name}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
            <div className="p-2">
              <p className="truncate font-display text-xs font-semibold text-bone">
                {g.name}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-bone-faint">
                {g.slot}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-warm mt-8 flex items-start gap-3 p-5">
        <Icon name="flame" className="mt-0.5 h-5 w-5 shrink-0 text-ember" />
        <div>
          <div className="font-display text-sm font-semibold text-bone">
            The Forge sleeps, for now
          </div>
          <p className="mt-1 text-sm text-bone-mut">
            Forging opens as the game deepens. When the coals are lit, you will
            hammer these legends into something all your own.
          </p>
        </div>
      </div>
    </div>
  );
}
