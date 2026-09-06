"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Card as CardShell } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { CONSOLE_PAD } from "@/components/console/console-shell";
import { IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  hideHeading = false,
}: {
  watch: WatchItem[];
  onToggleWatch: (item: WatchItem) => void;
  /* Drops the icon and "Watchlist" title. See CoinList's own `hideHeading`. */
  hideHeading?: boolean;
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
    <CardShell pad="none" render={<section />} className={CONSOLE_PAD}>
      {hideHeading ? null : (
        <div className="flex items-center gap-2">
          <Icon name="eye" aria-hidden className="h-4 w-4 text-gold" />
          <h2 className="font-display text-sm font-semibold text-bone">
            Watchlist
          </h2>
        </div>
      )}

      <div className={cx("flex gap-2", hideHeading ? "mt-0" : "mt-3 md:mt-2")}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Track a token by symbol or address"
          placeholder="Track a token by symbol or address"
          className="h-11 w-full rounded-md border border-steel-line bg-panel/60 px-3 text-sm text-bone transition-colors duration-fast placeholder:text-bone-faint focus:border-gold md:h-9 md:text-[13px]"
        />
        <IconButton
          icon="plus"
          label="Track this token"
          variant="glass"
          onClick={() => void add()}
          disabled={adding || query.trim() === ""}
        />
      </div>
      {note ? <p className="mt-2 text-xs text-ember">{note}</p> : null}

      <div className="mt-2 flex flex-col gap-2 md:gap-1">
        {watch.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon="eye"
            title="Nothing tracked yet"
            body="Add a token above to track its price and 24h move."
          />
        ) : (
          watch.map((item) => {
            const card = cards[item.query];
            const isLoading = loading[item.query];
            return (
              <div
                key={item.query}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 md:min-h-9 md:p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-bone md:text-[13px]">
                    {card?.symbol ?? item.label}
                  </p>
                  <p className="truncate text-xs text-bone-faint md:text-[11px]">
                    {isLoading
                      ? "Reading market..."
                      : card?.name ?? "No market found"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold text-bone md:text-[13px]">
                      {card?.priceUsd != null
                        ? `$${card.priceUsd.toLocaleString(undefined, {
                            maximumFractionDigits: card.priceUsd < 1 ? 6 : 2,
                          })}`
                        : "--"}
                    </p>
                    {card?.change24h != null ? (
                      <p
                        className="tnum text-xs md:text-[11px]"
                        style={{
                          color:
                            card.change24h >= 0
                              ? "var(--chart-up)"
                              : "var(--chart-down)",
                        }}
                      >
                        {card.change24h >= 0 ? "+" : ""}
                        {card.change24h.toFixed(2)}%
                      </p>
                    ) : null}
                  </div>
                  <IconButton
                    icon="close"
                    label={`Remove ${item.label}`}
                    size="sm"
                    variant="glass"
                    onClick={() => onToggleWatch(item)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </CardShell>
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
