"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";

interface MeProfile {
  handle: string | null;
}

const steps = [
  {
    icon: "flag",
    title: "Share your banner",
    text: "Your link carries your name. Post it, whisper it, fly it wherever your people gather.",
  },
  {
    icon: "user",
    title: "They join and grow active",
    text: "A recruit counts when they truly live in the realm: posting, calling, showing up. Idle accounts raise no banners.",
  },
  {
    icon: "coin",
    title: "You both earn when they act",
    text: "Rewards flow from deeds, not signups, which keeps the whole thing sybil-resistant by design.",
  },
];

export default function BannersPage() {
  const { ready, authenticated } = useRealmAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) return;
    setLoading(true);
    void (async () => {
      const res = await realmFetch<{ profile?: MeProfile }>("/api/me", {
        method: "POST",
      });
      setMe(res.data?.profile ?? null);
      setLoading(false);
    })();
  }, [ready, authenticated]);

  const link = me?.handle
    ? `${window.location.origin}/welcome?banner=${me.handle}`
    : null;

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

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="font-display text-xl font-semibold text-bone">
        Raise Your Banners
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Refer and earn
      </p>

      {!ready || loading ? (
        <div className="glass mt-5 h-48 animate-pulse" />
      ) : !authenticated || !me?.handle ? (
        <div className="glass mt-5 p-8 text-center">
          <Icon name="flag" className="mx-auto h-7 w-7 text-gold" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-bone-mut">
            {!authenticated
              ? "Every citizen carries a banner with their name on it. Enter the realm to claim yours."
              : "Claim your handle first; your banner link carries your name."}
          </p>
          <Link
            href={!authenticated ? "/signin" : "/keep"}
            className="btn-gold mt-5 px-5 py-2.5 text-sm"
          >
            {!authenticated ? "Enter the realm" : "Finish your Keep"}
          </Link>
        </div>
      ) : (
        <>
          {/* Banner link */}
          <div className="glass-warm glass mt-5 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
              Your banner
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="glass-sm min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl border border-steel-line bg-void px-4 py-3 text-xs text-gold-bright">
                {link}
              </code>
              <button
                onClick={copy}
                className="btn-gold shrink-0 px-5 py-2.5 text-sm"
              >
                <Icon name="banner" className="h-4 w-4" />
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>

          {/* How it works */}
          <h2 className="mt-8 font-display text-base font-semibold text-bone">
            How it works
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="glass glass-sm p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-line bg-panel">
                    <Icon name={s.icon} className="h-4 w-4 text-gold" />
                  </span>
                  <span className="tnum font-display text-sm text-bone-faint">
                    {i + 1}
                  </span>
                </div>
                <p className="mt-3 font-display text-sm font-semibold text-bone">
                  {s.title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-bone-mut">
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          {/* Rewards note */}
          <div className="glass glass-sm mt-4 p-5">
            <p className="text-sm text-bone-mut">
              <span className="font-semibold text-bone">
                What you earn, plainly:
              </span>{" "}
              points and Renown now, credited as your recruits act. $RSP
              comes later, at Season claims, non-custodial and claimed by you
              alone. No promises of profit, just a fair cut of the standing you
              helped build.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
