"use client";

import { useEffect, useState } from "react";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { crests, CrestRoundel } from "@/components/brand/crests";
import { BackButton } from "@/components/shell/back-button";

interface MeProfile {
  id: string;
  tier: string;
  renown: number;
}

const TIERS = [
  { slug: "smallfolk", name: "Smallfolk", min: 0 },
  { slug: "squire", name: "Squire", min: 100 },
  { slug: "knight", name: "Knight", min: 400 },
  { slug: "lord", name: "Lord / Lady", min: 1200 },
  { slug: "warden", name: "Warden", min: 3000 },
  { slug: "hand", name: "Hand", min: 7000 },
  { slug: "king", name: "King / Queen", min: 15000 },
];

export default function RenownPage() {
  const { ready, authenticated } = useRealmAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [earned, setEarned] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void (async () => {
      const res = await realmFetch<{ profile?: MeProfile }>("/api/me", {
        method: "POST",
      });
      const profile = res.data?.profile ?? null;
      setMe(profile);
      if (profile) {
        const db = createClient();
        const { data } = await db
          .from("user_crests")
          .select("crest_slug")
          .eq("profile_id", profile.id);
        setEarned(
          new Set((data ?? []).map((r) => r.crest_slug as string))
        );
      }
    })();
  }, [ready, authenticated]);

  const tierIndex = me
    ? Math.max(
        0,
        TIERS.findIndex((t) => t.slug === me.tier)
      )
    : -1;
  const nextTier = tierIndex >= 0 ? TIERS[tierIndex + 1] : undefined;
  const progress =
    me && nextTier
      ? Math.min(
          100,
          Math.max(
            0,
            ((me.renown - TIERS[tierIndex].min) /
              (nextTier.min - TIERS[tierIndex].min)) *
              100
          )
        )
      : 100;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="font-display text-xl font-semibold text-bone">
        Crests and Renown
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Standing · badges of deed
      </p>

      {/* Tier ladder */}
      <div className="mt-5 -mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
        <div className="flex w-max gap-2 pb-1">
          {TIERS.map((t, i) => {
            const isMine = me !== null && i === tierIndex;
            return (
              <div
                key={t.slug}
                className={`glass glass-sm shrink-0 px-4 py-3 text-center ${
                  isMine ? "border border-gold/60" : ""
                }`}
              >
                <p
                  className={`font-display text-sm font-semibold ${
                    isMine ? "text-gold-bright" : "text-bone"
                  }`}
                >
                  {t.name}
                </p>
                <p className="tnum mt-0.5 text-[11px] text-bone-faint">
                  {t.min.toLocaleString()}+ Renown
                </p>
                {isMine && (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gold">
                    Your tier
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {me && (
        <div className="glass glass-sm mt-3 p-4">
          {nextTier ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-bone-mut">
                  Road to{" "}
                  <span className="font-semibold text-bone">
                    {nextTier.name}
                  </span>
                </p>
                <p className="tnum text-xs text-bone-faint">
                  {me.renown.toLocaleString()} / {nextTier.min.toLocaleString()}{" "}
                  Renown
                </p>
              </div>
              <div className="bar-track mt-2 h-2 w-full">
                <div className="bar-gold h-full" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-bone-mut">
              You stand at the summit. There is no higher tier to climb.
            </p>
          )}
        </div>
      )}

      {/* Crests */}
      <h2 className="mt-8 font-display text-base font-semibold text-bone">
        The Crests
      </h2>
      <p className="text-xs text-bone-faint">
        Earned, never bought. Never NFTs, never for sale.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {crests.map((c) => {
          const isEarned = earned?.has(c.slug) ?? false;
          const dim = c.status === "locked" || (earned !== null && !isEarned);
          return (
            <div
              key={c.slug}
              className={`rarity-${c.rarity} rarity-frame glass glass-sm flex flex-col items-center p-5 text-center`}
            >
              <CrestRoundel icon={c.icon} className="h-20 w-20" dim={dim} />
              <p className="mt-3 font-display text-base font-semibold text-bone">
                {c.name}
              </p>
              <p className="text-xs text-bone-faint">{c.plain}</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                <span className={`rarity-${c.rarity} rarity-chip`}>
                  {c.rarity}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${
                    c.status === "live"
                      ? "border-steel-line text-bone-mut"
                      : "border-steel-line text-bone-faint"
                  }`}
                >
                  {c.status === "live" ? "Live" : "Locked"}
                </span>
                {isEarned && (
                  <span className="rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold-bright">
                    Earned
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-bone-mut">
                {c.earn}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
