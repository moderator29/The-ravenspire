"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { txExplorerUrlFor } from "@/components/wallet/chains";
import { WatchBadge } from "@/components/tools/watch-badge";

/* The realm's shared trade feed: real, on-chain buys, sells and swaps made in
   platform by members, newest first. Reads the members-only feed route; never
   seeded or invented. Honest empty state when the realm has not traded yet. */

interface RealmTrade {
  id: string;
  kind: "buy" | "sell" | "swap";
  chainId: number;
  txHash: string;
  sellSymbol: string | null;
  sellAmount: string | null;
  buySymbol: string | null;
  buyAmount: string | null;
  buyContract: string | null;
  usdValue: number | null;
  createdAt: string;
  trader: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

function fmtAmount(raw: string | null): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (n >= 0.0001) return n.toFixed(4);
  return n.toPrecision(2);
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000)
    return `$${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string, now: number): string {
  if (!now) return "";
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function tradeLine(t: RealmTrade): string {
  const sell = `${fmtAmount(t.sellAmount)} ${t.sellSymbol ?? ""}`.trim();
  const buy = `${fmtAmount(t.buyAmount)} ${t.buySymbol ?? ""}`.trim();
  if (t.kind === "buy") return `bought ${buy}`;
  if (t.kind === "sell") return `sold ${sell}`;
  return `swapped ${sell || t.sellSymbol} for ${buy || t.buySymbol}`;
}

export function RealmTrades() {
  const [trades, setTrades] = useState<RealmTrade[] | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<{ trades?: RealmTrade[] }>(
        "/api/trade/record?limit=20"
      );
      if (!cancelled) setTrades(res.data?.trades ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Icon name="coin" className="h-5 w-5 shrink-0 text-gold" />
        <h2 className="font-display text-lg font-semibold text-bone">
          The realm is trading
        </h2>
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Beta
        </span>
      </div>
      <p className="mt-2 text-sm text-bone-mut">
        Real, on-chain trades made in platform by members. Newest first.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {trades === null ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-14 animate-pulse" />
          ))
        ) : trades.length === 0 ? (
          <div className="glass p-6 text-center text-sm text-bone-mut">
            No trades in the realm yet. Make the first move through the Scrying
            Glass or The Swap.
          </div>
        ) : (
          trades.map((t) => {
            const name =
              t.trader.displayName ??
              (t.trader.handle ? `@${t.trader.handle}` : "A member");
            const explorer = txExplorerUrlFor(t.chainId, t.txHash);
            const up = t.kind === "buy";
            return (
              <div
                key={t.id}
                className="glass glass-sm flex items-center gap-3 px-3.5 py-3"
              >
                {t.trader.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={t.trader.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-steel-line object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
                    <Icon name="user" className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bone">
                    <span className="font-medium">
                      {t.trader.handle ? (
                        <Link
                          href={`/u/${t.trader.handle}`}
                          className="hover:underline"
                        >
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </span>{" "}
                    <span
                      className={up ? "text-gold-bright" : "text-bone-mut"}
                    >
                      {tradeLine(t)}
                    </span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-[11px] text-bone-faint">
                      {t.usdValue ? `${fmtUsd(t.usdValue)} · ` : ""}
                      {timeAgo(t.createdAt, now)} ago
                    </p>
                    {t.buyContract && (
                      <WatchBadge
                        address={t.buyContract}
                        chain={String(t.chainId)}
                        linkToWatch={false}
                      />
                    )}
                  </div>
                </div>
                {explorer && (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View transaction"
                    className="shrink-0 text-bone-faint transition-colors hover:text-gold"
                  >
                    <Icon name="arrow" className="h-4 w-4" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
