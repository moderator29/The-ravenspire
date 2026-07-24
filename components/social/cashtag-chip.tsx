"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { TokenLogo } from "@/components/coin/token-logo";
import { realmFetch } from "@/lib/auth/api";
import { tradeChainById } from "@/lib/trade/config";

/* A tappable $cashtag. Tapping it opens a quick coin sheet — real price, chain
   and logo pulled live from the same search The Swap uses — with one tap to
   read the coin or trade it. Rendered as a button (never an anchor) so it can
   live inside a post's body link without nesting anchors. */

interface CoinHit {
  address: string;
  symbol: string;
  name: string;
  chainId: number;
  chainLabel: string;
  logo: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

function formatPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(2)}`;
  return "—";
}

function coinHref(hit: CoinHit): string {
  const net = tradeChainById(hit.chainId)?.gecko;
  const qs = new URLSearchParams();
  if (net) qs.set("net", net);
  if (hit.symbol) qs.set("sym", hit.symbol);
  const suffix = qs.toString();
  return `/coin/${encodeURIComponent(hit.address)}${suffix ? `?${suffix}` : ""}`;
}

export function CashtagChip({ tag }: { tag: string }) {
  /* `tag` includes the leading $, uppercased by RichBody. */
  const symbol = tag.replace(/^\$/, "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hit, setHit] = useState<CoinHit | null>(null);
  const [missed, setMissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setMissed(false);
    void realmFetch<{ results?: CoinHit[] }>(
      `/api/trade/tokens?q=${encodeURIComponent(symbol)}`
    ).then((res) => {
      if (!alive) return;
      const top = res.data?.results?.[0] ?? null;
      setHit(top);
      setMissed(!top);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, symbol]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="font-semibold text-gold transition hover:text-gold-bright"
      >
        {tag}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
            <button
              aria-label="Close"
              onClick={close}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <div className="glass glass-warm relative w-full rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-gold">
                  {tag}
                </span>
                <button
                  aria-label="Close"
                  onClick={close}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-bone-faint hover:bg-panel hover:text-bone-mut"
                >
                  <Icon name="plus" className="h-4 w-4 rotate-45" />
                </button>
              </div>

              {loading ? (
                <div className="mt-4 h-16 animate-pulse rounded-2xl bg-panel" />
              ) : missed || !hit ? (
                <div className="mt-4">
                  <p className="text-sm text-bone-mut">
                    No actively-traded coin found for {tag} right now.
                  </p>
                  <Link
                    href={`/search?q=${encodeURIComponent(tag)}`}
                    onClick={close}
                    className="btn-glass mt-3 inline-flex px-4 py-2 text-xs text-bone-mut"
                  >
                    Search the realm
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-center gap-3">
                    <TokenLogo src={hit.logo} symbol={hit.symbol} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-bone">
                        {hit.symbol}
                        <span className="ml-1.5 rounded-full border border-steel-line/70 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-bone-faint">
                          {hit.chainLabel}
                        </span>
                      </p>
                      <p className="truncate text-xs text-bone-faint">
                        {hit.name}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-right text-sm font-semibold text-bone">
                      {formatPrice(hit.priceUsd)}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={coinHref(hit)}
                      onClick={close}
                      className="btn-glass flex-1 px-4 py-2 text-center text-xs text-bone-mut"
                    >
                      Read the coin
                    </Link>
                    <Link
                      href="/swap"
                      onClick={close}
                      className="btn-gold flex-1 px-4 py-2 text-center text-xs"
                    >
                      Trade it
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
