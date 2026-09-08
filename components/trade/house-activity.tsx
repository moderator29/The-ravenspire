"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { houseBySlug, houseIcon } from "@/lib/data/houses";

/* "Houses are trading this": real social proof scoped to one coin, not the
   realm-wide tape RealmTrades already draws. Reads the verified trade feed
   joined against real House membership; a coin no House member has traded in
   the last week renders nothing at all, never a placeholder "no House
   activity yet" line, since that would be manufacturing a stat about the
   absence of one. */

interface HouseActivityRow {
  slug: string;
  traderCount: number;
  tradeCount: number;
}

export function HouseActivity({
  chainId,
  address,
}: {
  chainId: number;
  address: string;
}) {
  const [houses, setHouses] = useState<HouseActivityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHouses(null);
    void (async () => {
      const res = await realmFetch<{ houses?: HouseActivityRow[] }>(
        `/api/trade/house-activity?chainId=${chainId}&address=${address}`
      );
      if (!cancelled) setHouses(res.ok ? (res.data?.houses ?? []) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, address]);

  if (!houses || houses.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Houses trading this
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {houses.map((h) => {
          const house = houseBySlug(h.slug);
          if (!house) return null;
          return (
            <Link
              key={h.slug}
              href={`/houses/${h.slug}`}
              className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs text-bone-mut transition-colors duration-fast hover:text-bone"
              style={{ borderColor: `${house.color}40` }}
            >
              <span style={{ color: house.color }}>
                <Icon name={houseIcon(h.slug)} className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-bone">{house.name}</span>
              <span className="tnum text-bone-faint">
                {h.traderCount} {h.traderCount === 1 ? "member" : "members"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
