"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/cx";
import { TokenLogo } from "@/components/coin/token-logo";
import { realmFetch } from "@/lib/auth/api";
import { tradeChainById } from "@/lib/trade/config";

/* A tappable $cashtag. Tapping it opens a quick coin sheet, real price, chain
   and logo pulled live from the same search The Swap uses, with one tap to
   read the coin or trade it. Rendered as a button (never an anchor) so it can
   live inside a post's body link without nesting anchors.

   Two shapes. Inline, it is a word in a sentence and must stay a word: giving
   it a control's height and padding would break the line box of every raven
   that mentions a coin. As a `chip`, on a discovery rail, it is a real control
   and takes the rounded rectangle and the 44px touch target. */

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
  if (n === null || !Number.isFinite(n)) return "·";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(2)}`;
  return "·";
}

function coinHref(hit: CoinHit): string {
  const net = tradeChainById(hit.chainId)?.gecko;
  const qs = new URLSearchParams();
  if (net) qs.set("net", net);
  if (hit.symbol) qs.set("sym", hit.symbol);
  const suffix = qs.toString();
  return `/coin/${encodeURIComponent(hit.address)}${suffix ? `?${suffix}` : ""}`;
}

export function CashtagChip({ tag, chip }: { tag: string; chip?: boolean }) {
  /* `tag` includes the leading $, uppercased by RichBody. */
  const symbol = tag.replace(/^\$/, "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hit, setHit] = useState<CoinHit | null>(null);
  const [missed, setMissed] = useState(false);

  /* The lookup is still gated on `open`, exactly as it was before the sheet
     became a primitive. A cashtag in a timeline must never cost a request. */
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

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Read ${tag}`}
        className={cx(
          "font-semibold text-gold transition-colors duration-fast ease-out-quint hover:text-gold-bright",
          chip &&
            "inline-flex h-11 shrink-0 items-center rounded-sm border border-steel-line bg-void px-3 text-sm hover:border-gold/40"
        )}
      >
        {tag}
      </button>

      <AdaptiveDialog open={open} onOpenChange={setOpen} title={tag} size="sm">
        {loading ? (
          <div className="flex items-center gap-3">
            <Skeleton radius="full" className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton radius="sm" className="h-3.5 w-24" />
              <Skeleton radius="sm" className="mt-2 h-3 w-32" />
            </div>
            <Skeleton radius="sm" className="h-4 w-16 shrink-0" />
          </div>
        ) : missed || !hit ? (
          <EmptyState
            icon="search"
            title="No live market"
            body={`Nothing is actively traded under ${tag} right now.`}
            action={
              <Button
                variant="glass"
                size="lg"
                render={
                  <Link
                    href={`/search?q=${encodeURIComponent(tag)}`}
                    onClick={() => setOpen(false)}
                  />
                }
              >
                Search the realm
              </Button>
            }
          />
        ) : (
          <>
            <Card variant="inset" pad="sm" className="flex items-center gap-3">
              <TokenLogo src={hit.logo} symbol={hit.symbol} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-bone">
                  {hit.symbol}
                  <span className="ml-1.5 rounded-sm border border-steel-line/70 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-bone-faint">
                    {hit.chainLabel}
                  </span>
                </p>
                <p className="truncate text-xs text-bone-faint">{hit.name}</p>
              </div>
              <span className="tnum shrink-0 text-right text-sm font-semibold text-bone">
                {formatPrice(hit.priceUsd)}
              </span>
            </Card>
            <div className="mt-4 flex gap-2">
              <Button
                variant="glass"
                size="lg"
                block
                render={
                  <Link href={coinHref(hit)} onClick={() => setOpen(false)} />
                }
              >
                Read the coin
              </Button>
              <Button
                variant="gold"
                size="lg"
                block
                render={<Link href="/swap" onClick={() => setOpen(false)} />}
              >
                Trade it
              </Button>
            </div>
          </>
        )}
      </AdaptiveDialog>
    </>
  );
}
