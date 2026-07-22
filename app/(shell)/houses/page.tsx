"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { houses as houseData } from "@/lib/data/houses";
import { Icon } from "@/components/ui/icon";

interface HouseRow {
  slug: string;
  name: string;
  motto: string;
  member_count: number;
  glory: number;
}

const sigilIcon: Record<string, string> = {
  raven: "raven",
  flame: "flame",
  snowflake: "shield",
  storm: "signal",
  moon: "eye",
  lion: "crown",
};

export default function HousesPage() {
  const [rows, setRows] = useState<HouseRow[]>([]);

  useEffect(() => {
    const db = createClient();
    void db
      .from("houses")
      .select("slug, name, motto, member_count, glory")
      .order("glory", { ascending: false })
      .then(({ data }) => setRows((data as HouseRow[]) ?? []));
  }, []);

  const maxGlory = Math.max(1, ...rows.map((r) => r.glory));

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="font-display text-xl font-semibold text-bone">Houses</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Communities · standings
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {(rows.length
          ? rows
          : houseData.map((h) => ({
              slug: h.slug,
              name: h.name,
              motto: h.motto,
              member_count: 0,
              glory: 0,
            }))
        ).map((row, i) => {
          const meta = houseData.find((h) => h.slug === row.slug);
          return (
            <Link
              key={row.slug}
              href={`/houses/${row.slug}`}
              className="glass glass-sm glass-hover flex items-center gap-4 p-4"
            >
              <span className="tnum w-5 text-center font-display text-lg text-bone-faint">
                {i + 1}
              </span>
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: `linear-gradient(160deg, ${meta?.color ?? "#C8A24C"}22, #101017)`,
                  border: `1px solid ${meta?.color ?? "#C8A24C"}44`,
                  color: meta?.color ?? "#C8A24C",
                }}
              >
                <Icon
                  name={sigilIcon[meta?.sigil ?? ""] ?? "banner"}
                  className="h-5 w-5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-bone">
                  {row.name}
                </p>
                <p className="truncate text-xs italic text-bone-faint">
                  {row.motto}
                </p>
                <div className="bar-track mt-2 h-1.5 w-full">
                  <div
                    className="bar-gold h-full"
                    style={{
                      width: `${Math.max(4, (row.glory / maxGlory) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-sm font-semibold text-gold">
                  {row.glory.toLocaleString()} Glory
                </p>
                <p className="tnum text-xs text-bone-faint">
                  {row.member_count.toLocaleString()} sworn
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
