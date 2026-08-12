"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ConsoleHeader,
  ConsolePage,
} from "@/components/console/console-shell";
import { Sequencing } from "@/components/dna/sequencing";
import { DnaCard } from "@/components/dna/dna-card";
import type { DnaResult } from "@/components/dna/types";
import { realmFetch } from "@/lib/auth/api";

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
      /* Carries the member's token when there is one, so a signed-in reader is
         metered on their account rather than on a shared address. */
      const res = await realmFetch<DnaResult & { error?: string }>("/api/dna", {
        method: "POST",
        json: { query: q },
      });
      const data = res.data;
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
    <ConsolePage width="data">
      <ConsoleHeader title="DNA Analyzer" kicker="Intel engine" />

      <p className="mt-3 text-sm text-bone-mut md:mt-2 md:text-[13px]">
        Drop an EVM wallet address or a member&apos;s @handle. The engine reads
        real data and returns a DNA profile: the archetype, the traits, the
        signal. Nothing invented.
      </p>

      {/* Input */}
      <form
        className="mt-4 md:mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void analyze(query);
        }}
      >
        {/* The one control rail on this Console: subject in, analysis out.

            A `label`, not a `div`. The row is 48px and the input inside it was
            39px, so the rail looked like the target and only part of it was.
            Wrapping in a label makes the whole rail focus the field, which is
            what a member is already aiming at. */}
        <label className="flex items-center gap-2 rounded-lg border border-steel-line bg-void/50 p-1.5 pl-3">
          <Icon
            name="search"
            aria-hidden
            className="h-4 w-4 shrink-0 text-bone-faint"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError(null);
            }}
            placeholder="0x address or @handle"
            aria-label="EVM address or member handle"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-bone outline-none touch:min-h-11 placeholder:text-bone-faint md:py-1 md:text-[13px]"
          />
          <Button
            variant="gold"
            size="md"
            type="submit"
            className="shrink-0"
            disabled={loading || !kind}
            loading={loading}
          >
            {loading ? "Sequencing" : "Analyze"}
          </Button>
        </label>

        {/* Live detect hint */}
        <div className="mt-2 flex min-h-[1rem] items-center gap-2 px-1 text-[11px]">
          {kind && !loading && (
            <span className="text-gold">
              Reads as {kind === "wallet" ? "an EVM wallet" : "a member handle"}
            </span>
          )}
          {error && <span className="text-ember-deep">{error}</span>}
        </div>
      </form>

      {/* Result zone */}
      <div className="mt-4 md:mt-3">
        {loading ? (
          <Sequencing subject={shortSubject(query, kind)} />
        ) : result ? (
          <DnaCard result={result} />
        ) : (
          <Card pad="none">
            <EmptyState
              size="sm"
              icon="orb"
              title="Two strands to read"
              body="A wallet's on-chain trail, or a member's public voice. Enter one above to sequence it."
              action={
                <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-bone-faint">
                  <span className="rounded-sm border border-steel-line/70 px-2.5 py-1">
                    The Patient Whale
                  </span>
                  <span className="rounded-sm border border-steel-line/70 px-2.5 py-1">
                    The Degen Sniper
                  </span>
                  <span className="rounded-sm border border-steel-line/70 px-2.5 py-1">
                    The Realm Herald
                  </span>
                </div>
              }
            />
          </Card>
        )}
      </div>
    </ConsolePage>
  );
}

export default function DnaPage() {
  return (
    <Suspense fallback={null}>
      <Analyzer />
    </Suspense>
  );
}
