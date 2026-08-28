"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/* Live realm activity for the hero: real members, ravens and trades as social
   proof. Honest: it shows only the counts that are actually above zero, so an
   early realm never inflates itself. Fetched from the public /api/stats. */

/* The exact shape app/api/stats/route.ts returns, houses included even though
   the hero does not show it: a partial mirror of a payload is how a renamed
   field breaks a display with no type anywhere going red. */
interface Stats {
  members: number;
  ravens: number;
  trades: number;
  houses: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  if (n >= 10_000)
    return `${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return n.toLocaleString("en-US");
}

export function LiveRealmStats({ className = "" }: { className?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stats");
        /* A 500 page is not JSON. Without this guard the json() below threw
           on error responses and the catch hid it, which happened to be the
           right outcome by accident; an HTML error page that parsed as JSON
           would have been the wrong outcome with no error at all. */
        if (!res.ok) return;
        const body = (await res.json()) as Stats;
        if (!cancelled) setStats(body);
      } catch {
        /* stay quiet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;
  const items = [
    { icon: "user", value: stats.members, label: "members" },
    { icon: "raven", value: stats.ravens, label: "ravens sent" },
    { icon: "coin", value: stats.trades, label: "trades made" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2.5 ${className}`}
    >
      {items.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1.5 rounded-sm border border-gold/25 bg-panel-warm/40 px-3 py-1.5 text-xs text-bone-mut"
        >
          <Icon name={i.icon} className="h-3.5 w-3.5 text-gold" />
          <span className="tnum font-semibold text-bone">{fmt(i.value)}</span>
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[11px] text-bone-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
        live
      </span>
    </div>
  );
}
