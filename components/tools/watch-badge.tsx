"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { WatchVerdict } from "@/lib/tools/watch-types";

interface Props {
  address: string;
  chain?: string;
  /* Link through to the full scan in The Watch. */
  linkToWatch?: boolean;
  className?: string;
}

interface Loaded {
  score: number;
  verdict: WatchVerdict;
}

const styleFor: Record<WatchVerdict, string> = {
  safe: "text-gold border-gold/40",
  caution: "text-ember border-ember/40",
  danger: "text-ember-deep border-ember-deep/40",
  unknown: "text-bone-faint border-steel-line",
};

/* A tiny defenses chip for any on-chain address. Lazily reads The Watch and
   renders the real score, converting siloed addresses into safety signal.
   Renders nothing until it has a real answer; never invents a score. */
export function WatchBadge({
  address,
  chain = "1",
  linkToWatch = true,
  className = "",
}: Props) {
  const [state, setState] = useState<Loaded | "loading" | "none">("loading");

  useEffect(() => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setState("none");
      return;
    }
    let alive = true;
    fetch(`/api/watch?address=${encodeURIComponent(address)}&chain=${chain}`)
      .then((r) => r.json())
      .then((d: { score?: number; verdict?: WatchVerdict; error?: string }) => {
        if (!alive) return;
        if (typeof d.score === "number" && d.verdict) {
          setState({ score: d.score, verdict: d.verdict });
        } else {
          setState("none");
        }
      })
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [address, chain]);

  if (state === "loading")
    return (
      <span
        className={`inline-block h-5 w-12 shrink-0 animate-pulse rounded-full bg-panel ${className}`}
        aria-hidden
      />
    );
  if (state === "none") return null;

  const chip = (
    <span
      className={`tnum inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styleFor[state.verdict]} ${className}`}
      title={`Watch defenses score ${state.score}/100`}
    >
      <Icon name="shield" className="h-3 w-3" />
      {state.score}
    </span>
  );

  if (!linkToWatch) return chip;
  return (
    <Link
      href={`/watch?address=${address}${chain !== "1" ? `&chain=${chain}` : ""}`}
      aria-label={`View Watch scan, defenses score ${state.score} of 100`}
    >
      {chip}
    </Link>
  );
}
