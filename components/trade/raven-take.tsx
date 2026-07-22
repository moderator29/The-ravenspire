"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";

/* The Raven's read on a single coin. A real LLM (via /api/raven) reasoning over
   the real market figures we already hold, folded into a short, sharp take.
   Nothing canned: we send the live numbers as context and render what the
   Herald says. Collapsed by default; the member taps to summon it. */
export function RavenTake({
  symbol,
  address,
  chainLabel,
  priceUsd,
  change24h,
  marketCap,
  liquidityUsd,
  volume24h,
  ageDays,
}: {
  symbol: string;
  address: string;
  chainLabel: string | null;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  ageDays: number | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [take, setTake] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summon = async () => {
    setState("loading");
    setError(null);
    const facts = [
      `$${symbol}`,
      chainLabel ? `on ${chainLabel}` : "",
      `contract ${address}`,
      priceUsd !== null ? `price $${priceUsd}` : "",
      change24h !== null ? `24h change ${change24h.toFixed(1)}%` : "",
      marketCap !== null ? `market cap $${Math.round(marketCap)}` : "",
      liquidityUsd !== null ? `liquidity $${Math.round(liquidityUsd)}` : "",
      volume24h !== null ? `24h volume $${Math.round(volume24h)}` : "",
      ageDays !== null ? `pool age about ${ageDays} days` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const prompt = `Give me your read on this coin as the Raven: ${facts}. In two or three sentences, say what it looks like, whether the trading interest reads organic or thin, and the honest risk. Do not give financial advice or price targets, do not use em-dashes.`;

    const res = await realmFetch<{ reply?: string; error?: string }>(
      "/api/raven",
      {
        method: "POST",
        json: {
          messages: [{ role: "user", content: prompt }],
          length: "short",
        },
      }
    );

    if (res.ok && res.data?.reply) {
      setTake(res.data.reply);
      setState("done");
    } else {
      setError(
        res.data?.error ??
          "The Raven is preoccupied and could not read this coin right now."
      );
      setState("error");
    }
  };

  return (
    <div className="glass-warm mt-3 p-4">
      <div className="flex items-center gap-2">
        <Icon name="raven" className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-sm font-semibold text-bone">The Raven&apos;s read</p>
      </div>

      {state === "idle" && (
        <button
          type="button"
          onClick={() => void summon()}
          className="btn-glass mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-gold"
        >
          <Icon name="eye" className="h-3.5 w-3.5" />
          Summon the Raven&apos;s take
        </button>
      )}

      {state === "loading" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-bone-faint">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          The Raven studies the coin...
        </div>
      )}

      {state === "done" && take && (
        <p className="mt-2.5 text-sm leading-relaxed text-bone-mut">{take}</p>
      )}

      {state === "error" && (
        <div className="mt-2.5">
          <p className="text-sm text-bone-mut">{error}</p>
          <button
            type="button"
            onClick={() => void summon()}
            className="mt-2 text-xs text-gold underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === "done" && (
        <p className="mt-2.5 text-[11px] text-bone-faint">
          The Raven reasons over live market data. It can be wrong. Never a
          promise of price, only a read. Do your own research.
        </p>
      )}
    </div>
  );
}
