"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface RefMember {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string | null;
}
interface RefRow {
  activated: boolean;
  created_at: string;
  member: RefMember | null;
}
interface RefData {
  code: string | null;
  activated: number;
  pending: number;
  total: number;
  referrals: RefRow[];
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass-sm rounded-xl border border-steel-line bg-void px-3 py-3 text-center">
      <p className="tnum font-display text-xl font-semibold text-gold-bright">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-bone-faint">
        {label}
      </p>
    </div>
  );
}

export function ReferralPanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<RefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await realmFetch<RefData>("/api/referrals");
      if (cancelled) return;
      if (res.ok && res.data) setData(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const code = data?.code ?? null;
  const link = code && origin ? `${origin}/?ref=${code}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the link is still visible to copy by hand */
    }
  };

  if (!enabled) {
    return (
      <p className="text-sm text-bone-mut">
        Enter the realm to raise your banner.
      </p>
    );
  }

  if (loading) {
    return <div className="glass-sm h-40 animate-pulse rounded-xl" />;
  }

  if (!code) {
    return (
      <p className="text-sm text-bone-mut">
        Claim your handle first; your banner link carries your name.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Live standings */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={data?.activated ?? 0} label="Raised" />
        <Stat value={data?.pending ?? 0} label="Pending" />
        <Stat value={data?.total ?? 0} label="Sent" />
      </div>

      {/* Banner link */}
      <div className="glass-warm glass-sm rounded-xl p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
          Your banner link
        </p>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <code className="glass-sm min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-steel-line bg-void px-3 py-2.5 text-xs text-gold-bright">
            {link}
          </code>
          <button
            type="button"
            onClick={copy}
            className="btn-gold inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm"
          >
            <Icon name="banner" className="h-4 w-4" />
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* The roll of banners raised */}
      {data && data.referrals.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
            Your recruits
          </p>
          <ul className="flex flex-col divide-y divide-steel-line">
            {data.referrals.map((r, i) => {
              const m = r.member;
              const name = m?.display_name || m?.handle || "A wanderer";
              return (
                <li
                  key={`${m?.handle ?? "x"}-${i}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel">
                    {m?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.avatar_url}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Icon name="user" className="h-4 w-4 text-bone-faint" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-bone">{name}</p>
                    {m?.handle ? (
                      <p className="tnum truncate font-mono text-xs text-bone-faint">
                        @{m.handle}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      r.activated
                        ? "border-gold/50 bg-gold/15 text-gold-bright"
                        : "border-steel-line bg-panel text-bone-faint"
                    }`}
                  >
                    {r.activated ? "Raised" : "Pending"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-bone-mut">
          No banners raised yet. A recruit counts the moment they join under your
          banner. Rewards are earned as they truly live in the realm, posting and
          showing up, which keeps this sybil-resistant by design.
        </p>
      )}

      <p className="text-xs leading-relaxed text-bone-faint">
        Points and Renown are credited as your recruits act. $RSP comes later,
        at Season claims, non-custodial and claimed by you alone.
      </p>
    </div>
  );
}
