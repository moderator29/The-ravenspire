"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
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
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-center gap-2.5">
        <h1 className="font-display text-xl font-semibold text-bone">
          The Oracle
        </h1>
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Account scanner
      </p>
      <p className="mt-3 text-sm text-bone-mut">
        A real AI read of your own account: your standing, your posts and your
        linked wallet, with honest strengths, risks and next moves. Only your
        data is read, never anyone else&apos;s.
      </p>

      {stats && (
        <div className="mt-5 grid grid-cols-3 gap-2">
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
        <button
          type="button"
          onClick={() => void scan()}
          disabled={state === "loading"}
          className="btn-gold mt-5 w-full py-3 text-sm disabled:opacity-60"
        >
          {state === "loading" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#171204]/40 border-t-[#171204]" />
              The Oracle reads you...
            </>
          ) : (
            <>
              <Icon name="orb" className="h-4 w-4" />
              Scan my account
            </>
          )}
        </button>
      )}

      {state === "error" && (
        <p className="mt-3 text-sm text-ember">{error}</p>
      )}

      {state === "done" && briefing && (
        <div className="glass-warm mt-5 p-5">
          <div className="flex items-center gap-2">
            <Icon name="orb" className="h-4 w-4 text-gold" />
            <p className="text-sm font-semibold text-bone">Your briefing</p>
          </div>
          <div className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed text-bone-mut">
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
          <button
            type="button"
            onClick={() => void scan()}
            className="btn-glass mt-4 w-full py-2.5 text-sm"
          >
            <Icon name="orb" className="h-4 w-4" />
            Scan again
          </button>
          <p className="mt-3 text-[11px] text-bone-faint">
            The Oracle reasons over your real data. It can be wrong and gives no
            financial advice. Points convert to $RSP at TGE.
          </p>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass glass-sm p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      <p className="tnum mt-1 text-base font-semibold text-bone">{value}</p>
    </div>
  );
}
