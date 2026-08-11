"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ConsoleHeader,
  ConsolePage,
  CONSOLE_PAD,
} from "@/components/console/console-shell";
import { realmFetch } from "@/lib/auth/api";

/* The Oracle: an AI scan of your OWN account. A real LLM reads your real
   standing, posts and (if linked) wallet, and returns an honest briefing.
   Owner data only. Points shown as points. */

interface ScanStats {
  renown: number;
  glory: number;
  points: number;
  followers: number;
  posts: number;
  totalEngagement: number;
  walletUsd: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export default function ScannerPage() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [briefing, setBriefing] = useState<string | null>(null);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setState("loading");
    setError(null);
    const res = await realmFetch<{
      briefing?: string;
      stats?: ScanStats;
      error?: string;
    }>("/api/scanner", { method: "POST" });
    if (res.ok && res.data?.briefing) {
      setBriefing(res.data.briefing);
      setStats(res.data.stats ?? null);
      setState("done");
    } else {
      setError(res.data?.error ?? "The Oracle could not read you right now.");
      setState("error");
    }
  };

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Oracle"
        kicker="Account scanner"
        badge={<Badge variant="beta">Beta</Badge>}
      />

      <p className="mt-3 text-sm text-bone-mut md:mt-2 md:text-[13px]">
        A real AI read of your own account: your standing, your posts and your
        linked wallet, with honest strengths, risks and next moves. Only your
        data is read, never anyone else&apos;s.
      </p>

      {stats && (
        <div className="mt-4 grid grid-cols-3 gap-2 md:mt-3 md:grid-cols-6 md:gap-1.5">
          <StatTile label="Renown" value={fmt(stats.renown)} />
          <StatTile label="Points" value={fmt(stats.points)} />
          <StatTile label="Glory" value={fmt(stats.glory)} />
          <StatTile label="Followers" value={fmt(stats.followers)} />
          <StatTile label="Posts" value={fmt(stats.posts)} />
          <StatTile
            label="Engagement"
            value={fmt(stats.totalEngagement)}
          />
        </div>
      )}

      {state !== "done" && (
        <Button
          variant="gold"
          size="lg"
          block
          className="mt-4 md:mt-3 md:h-9 md:text-sm"
          loading={state === "loading"}
          disabled={state === "loading"}
          onClick={() => void scan()}
        >
          {state === "loading" ? (
            "The Oracle reads you..."
          ) : (
            <>
              <Icon name="orb" className="h-4 w-4" />
              Scan my account
            </>
          )}
        </Button>
      )}

      {state === "error" && (
        <p className="mt-3 text-sm text-ember md:mt-2 md:text-[13px]">{error}</p>
      )}

      {state === "done" && briefing && (
        <Card variant="warm" pad="none" className={cx("mt-4 md:mt-3", CONSOLE_PAD)}>
          <div className="flex items-center gap-2">
            <Icon name="orb" className="h-4 w-4 text-gold" />
            <p className="text-sm font-semibold text-bone">Your briefing</p>
          </div>
          <div className="mt-2.5 flex flex-col gap-2 text-sm leading-relaxed text-bone-mut md:mt-2 md:text-[13px]">
            {briefing
              .split(/\n+/)
              .filter((line) => line.trim())
              .map((line, i) => {
                const header = /^(#+\s*|\*\*)?([A-Z][A-Za-z ]{2,20})(\*\*|:)\s*$/.test(
                  line.trim()
                );
                const clean = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
                return header ? (
                  <p
                    key={i}
                    className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold"
                  >
                    {clean.replace(/:$/, "")}
                  </p>
                ) : (
                  <p key={i}>{clean}</p>
                );
              })}
          </div>
          <Button block className="mt-3 md:mt-2" onClick={() => void scan()}>
            <Icon name="orb" className="h-4 w-4" />
            Scan again
          </Button>
          <p className="mt-2.5 text-[11px] text-bone-faint">
            The Oracle reasons over your real data. It can be wrong and gives no
            financial advice. Points convert to $RSP at TGE.
          </p>
        </Card>
      )}
    </ConsolePage>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card pad="none" className="rounded-lg p-3 text-center md:p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      <p className="tnum mt-1 text-base font-semibold text-bone md:mt-0.5 md:text-sm">
        {value}
      </p>
    </Card>
  );
}
