"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { Sequencing } from "@/components/dna/sequencing";
import { DnaCard } from "@/components/dna/dna-card";
import type { DnaResult } from "@/components/dna/types";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@?[a-zA-Z0-9_]{1,30}$/;

type Kind = "wallet" | "social" | null;

function detect(value: string): Kind {
  const v = value.trim();
  if (ADDRESS_RE.test(v)) return "wallet";
  if (v && HANDLE_RE.test(v)) return "social";
  return null;
}

function shortSubject(value: string, kind: Kind): string {
  const v = value.trim();
  if (kind === "wallet") return `${v.slice(0, 6)}...${v.slice(-4)}`;
  if (kind === "social") return v.startsWith("@") ? v : `@${v}`;
  return v;
}

function Analyzer() {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const kind = detect(query);

  const analyze = useCallback(async (value: string) => {
    const q = value.trim();
    if (!q || loadingRef.current) return;
    if (!detect(q)) {
      setError("Enter an EVM address (0x...) or an @handle.");
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json().catch(() => null)) as
        | (DnaResult & { error?: string })
        | null;
      if (!res.ok || !data || data.error || !data.archetype) {
        setError(
          data?.error ?? "The sequencer stalled. Try again in a moment."
        );
      } else {
        setResult(data);
      }
    } catch {
      setError("The signal dropped. Try again in a moment.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  /* Deep-link support: /dna?q=... runs the analysis on load (shareable). The
     query state is seeded from the param already, so the effect only kicks off
     the fetch, never sets state synchronously. */
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = params.get("q");
    // Deliberate one-shot fetch for the shared link; state settles async.
    if (q) void analyze(q);
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel">
          <Icon name="orb" className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="gold-text font-display text-xl font-semibold">
            DNA Analyzer
          </h1>
          <p className="text-[11px] uppercase tracking-[0.26em] text-bone-faint">
            Intel engine
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-bone-mut">
        Drop an EVM wallet address or a member&apos;s @handle. The engine reads
        real data and returns a DNA profile: the archetype, the traits, the
        signal. Nothing invented.
      </p>

      {/* Input */}
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void analyze(query);
        }}
      >
        <div className="glass glass-sm flex items-center gap-2 p-2 pl-4">
          <Icon name="search" className="h-4 w-4 shrink-0 text-bone-faint" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x address or @handle"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-bone placeholder:text-bone-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !kind}
            className="btn-gold shrink-0 rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Sequencing" : "Analyze"}
          </button>
        </div>

        {/* Live detect hint */}
        <div className="mt-2 flex min-h-[1rem] items-center gap-2 px-1 text-[11px]">
          {kind && !loading && (
            <span className="inline-flex items-center gap-1.5 text-gold">
              <span className="h-1 w-1 rounded-full bg-gold" />
              Reads as {kind === "wallet" ? "an EVM wallet" : "a member handle"}
            </span>
          )}
          {error && <span className="text-ember-deep">{error}</span>}
        </div>
      </form>

      {/* Result zone */}
      <div className="mt-6">
        {loading ? (
          <Sequencing subject={shortSubject(query, kind)} />
        ) : result ? (
          <DnaCard result={result} />
        ) : (
          <div className="glass glass-sm px-5 py-8 text-center">
            <p className="text-sm text-bone-mut">
              Two strands to read: a wallet&apos;s on-chain trail, or a
              member&apos;s public voice. Enter one above to sequence it.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-bone-faint">
              <span className="rounded-full border border-steel-line/70 px-3 py-1">
                The Patient Whale
              </span>
              <span className="rounded-full border border-steel-line/70 px-3 py-1">
                The Degen Sniper
              </span>
              <span className="rounded-full border border-steel-line/70 px-3 py-1">
                The Realm Herald
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DnaPage() {
  return (
    <Suspense fallback={null}>
      <Analyzer />
    </Suspense>
  );
}
