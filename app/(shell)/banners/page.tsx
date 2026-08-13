"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  BoardHeader,
  BoardPage,
  BoardStack,
} from "@/components/board/board-shell";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

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
  const showSkeleton = useDelayedLoading(!ready || loading);

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
    <BoardPage width="narrow">
      <BoardStack>
        <BoardHeader title="Raise Your Banners" kicker="Refer and earn" />

        {!ready || loading ? (
          showSkeleton ? <Skeleton radius="xl" className="h-48" /> : null
        ) : !authenticated || !me?.handle ? (
          <Card>
            <EmptyState
              icon3d="alliance"
              title={
                !authenticated
                  ? "Your banner is waiting"
                  : "Your banner needs your name"
              }
              body={
                !authenticated
                  ? "Every citizen carries a banner with their name on it. Enter the realm to claim yours."
                  : "Claim your handle first; your banner link carries your name."
              }
              action={
                <Button
                  variant="gold"
                  size="lg"
                  render={<Link href={!authenticated ? "/signin" : "/keep"} />}
                >
                  {!authenticated ? "Enter the realm" : "Finish your Keep"}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {/* Banner link */}
            <Card variant="warm" pad="lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
                Your banner
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-steel-line bg-void px-4 py-3 text-xs text-gold-bright">
                  {link}
                </code>
                <Button
                  variant="gold"
                  size="lg"
                  className="shrink-0"
                  onClick={copy}
                >
                  <Icon name="banner" className="h-4 w-4" />
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </Card>

            {/* How it works */}
            <SectionHeader title="How it works" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {steps.map((s, i) => (
                <Card key={s.title} radius="lg" pad="md">
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
                </Card>
              ))}
            </div>

            {/* Rewards note */}
            <Card radius="lg" pad="lg" variant="inset">
              <p className="text-sm text-bone-mut">
                <span className="font-semibold text-bone">
                  What you earn, plainly:
                </span>{" "}
                points and Renown now, credited as your recruits act. $RSP
                comes later, at Season claims, non-custodial and claimed by you
                alone. No promises of profit, just a fair cut of the standing you
                helped build.
              </p>
            </Card>
          </>
        )}
      </BoardStack>
    </BoardPage>
  );
}
