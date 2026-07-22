"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The daily streak flame. Opening the app advances today's streak server-side;
   this shows the live count. The flame brightens with a longer streak, a small
   retention nudge that never nags. Renders nothing until there is a real
   streak of at least one day. */
export function StreakFlame({ className = "" }: { className?: string }) {
  const { ready, authenticated } = useRealmAuth();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void realmFetch<{ streak?: number }>("/api/streak").then((res) => {
      if (!cancelled) setStreak(res.data?.streak ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  if (!streak || streak < 1) return null;
  const hot = streak >= 7;

  return (
    <span
      title={`${streak} day streak. Come back tomorrow to keep it alive.`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        hot
          ? "border-gold/50 bg-panel-warm/70 text-gold-bright"
          : "border-gold/25 bg-panel-warm/40 text-gold"
      } ${className}`}
    >
      <Icon name="flame" className={`h-3.5 w-3.5 ${hot ? "text-gold-bright" : "text-gold"}`} />
      <span className="tnum text-xs font-semibold">{streak}</span>
    </span>
  );
}
