"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { WatchItem } from "@/components/wallet/wallet-prefs";

/* A lightweight watchlist. Members track any token by symbol or address; price
   and 24h change come from the existing keyless token lookup (DexScreener via
   /api/token), so nothing is fabricated. When a token has no trustworthy
   market, the row says so rather than inventing a number. */

interface Card {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  url: string | null;
}

export function WalletWatchlist({
  watch,
  onToggleWatch,
}: {
  watch: WatchItem[];
  onToggleWatch: (item: WatchItem) => void;
}) {
  const [cards, setCards] = useState<Record<string, Card | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    for (const item of watch) {
      const q = item.query;
      if (q in cards || loading[q]) continue;
      setLoading((l) => ({ ...l, [q]: true }));
      void (async () => {
        const card = await lookup(q);
        if (cancelled) return;
        setCards((c) => ({ ...c, [q]: card }));
        setLoading((l) => ({ ...l, [q]: false }));
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  const add = async () => {
    const q = query.trim();
    if (!q) return;
    setNote(null);
    setAdding(true);
    try {
      const card = await lookup(q);
      if (!card) {
        setNote("No trustworthy market found for that token.");
        return;
      }
      const label = card.symbol;
      setCards((c) => ({ ...c, [q.toLowerCase()]: card }));
      onToggleWatch({ query: q.toLowerCase(), label });
      setQuery("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <Icon name="eye" className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Watchlist
        </h2>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Track a token by symbol or address"
          className="w-full rounded-xl border border-steel-line bg-panel/60 px-3 py-2.5 text-sm text-bone outline-none placeholder:text-bone-faint focus:border-gold"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={adding || query.trim() === ""}
          className="btn-glass inline-flex shrink-0 items-center gap-1.5 px-3 text-sm disabled:opacity-50"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-ember">{note}</p> : null}

      <div className="mt-3 flex flex-col gap-2">
        {watch.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-steel-line bg-panel/25 p-4 text-center text-xs text-bone-faint">
            Add a token above to track its price and 24h move.
          </p>
        ) : (
          watch.map((item) => {
            const card = cards[item.query];
            const isLoading = loading[item.query];
            return (
              <div
                key={item.query}
                className="flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-bone">
                    {card?.symbol ?? item.label}
                  </p>
                  <p className="truncate text-xs text-bone-faint">
                    {isLoading
                      ? "Reading market..."
                      : card?.name ?? "No market found"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold text-bone">
                      {card?.priceUsd != null
                        ? `$${card.priceUsd.toLocaleString(undefined, {
                            maximumFractionDigits: card.priceUsd < 1 ? 6 : 2,
                          })}`
                        : "--"}
                    </p>
                    {card?.change24h != null ? (
                      <p
                        className={`tnum text-xs ${
                          card.change24h >= 0 ? "text-gold" : "text-ember"
                        }`}
                      >
                        {card.change24h >= 0 ? "+" : ""}
                        {card.change24h.toFixed(2)}%
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleWatch(item)}
                    aria-label={`Remove ${item.label}`}
                    className="btn-glass inline-flex h-8 w-8 items-center justify-center p-0"
                  >
                    <Icon name="plus" className="h-4 w-4 rotate-45" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

async function lookup(q: string): Promise<Card | null> {
  try {
    const res = await fetch(`/api/token?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { card: Card | null };
    return body.card ?? null;
  } catch {
    return null;
  }
}
