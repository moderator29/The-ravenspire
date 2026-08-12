"use client";

import { useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CONSOLE_PAD } from "@/components/console/console-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { TokenLogo } from "@/components/wallet/token-logo";
import { TokenFilter, type TokenFilters } from "@/components/wallet/token-filter";
import type { WalletToken } from "@/components/wallet/wallet-token-types";

const SMALL_USD = 1;

/* The multi-chain coin list on the wallet overview. Every row carries the
   provider logo (with a safe glyph fallback), symbol, name, a chain badge,
   the balance, and the USD value when the provider priced it. A compact filter
   controls chain and small-balance visibility without cluttering the header. */
export function CoinList({
  tokens,
  filters,
  onFilters,
  onSelect,
  onManage,
  loading,
  configured,
  error,
}: {
  tokens: WalletToken[];
  filters: TokenFilters;
  onFilters: (next: TokenFilters) => void;
  onSelect: (token: WalletToken) => void;
  onManage: () => void;
  loading: boolean;
  configured: boolean;
  error: string | null;
}) {
  const showSkeleton = useDelayedLoading(loading && tokens.length === 0, 300);

  const visible = useMemo(() => {
    return tokens.filter((t) => {
      if (filters.chains.length > 0 && !filters.chains.includes(t.chainId)) {
        return false;
      }
      if (filters.hideSmall && !t.isNative && t.quoteUsd < SMALL_USD) {
        return false;
      }
      return true;
    });
  }, [tokens, filters]);

  return (
    <Card pad="none" render={<section />} className={CONSOLE_PAD}>
      {/* The list's controls sit on one rail, never scattered into the rows. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="coin" aria-hidden className="h-4 w-4 text-gold" />
          <h2 className="font-display text-sm font-semibold text-bone">
            Tokens
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <TokenFilter value={filters} onChange={onFilters} />
          <Button size="sm" onClick={onManage}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Manage
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:mt-2 md:gap-1">
        {loading && tokens.length === 0 ? (
          showSkeleton ? (
            <CoinRowSkeleton />
          ) : null
        ) : !configured ? (
          <EmptyState
            size="sm"
            bordered
            icon="coin"
            title="Balances are resting"
            body="The balances provider is not configured in this environment, so live token balances cannot be read right now."
          />
        ) : error ? (
          <EmptyState
            size="sm"
            bordered
            icon="alert"
            title="Could not read balances"
            body="The balances provider did not answer just now. Refresh in a moment."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            size="sm"
            bordered
            icon="coin"
            title="No tokens to show"
            body={
              tokens.length > 0
                ? "Every token is filtered out. Adjust the filter to see them."
                : "Once you hold coin or tokens on a supported EVM chain, they appear here."
            }
          />
        ) : (
          visible.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t)}
              className="group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 text-left transition-colors duration-fast hover:border-gold/40 md:min-h-9 md:p-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="relative shrink-0">
                  <TokenLogo logo={t.logo} symbol={t.symbol} size={32} />
                  <span className="absolute -bottom-1 -right-1 rounded-sm border border-obsidian bg-panel-warm px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-gold">
                    {t.chainShort}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-bone md:text-[13px]">
                    {t.symbol}
                  </p>
                  <p className="truncate text-xs text-bone-faint md:text-[11px]">
                    {t.name}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-sm font-semibold text-bone md:text-[13px]">
                  {t.balanceDisplay}
                </p>
                <p className="tnum text-xs text-bone-faint md:text-[11px]">
                  {t.quoteUsd > 0 ? (
                    <>
                      ${t.quoteUsd.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      {t.change24h !== 0 ? (
                        <span
                          style={{
                            color:
                              t.change24h >= 0
                                ? "var(--chart-up)"
                                : "var(--chart-down)",
                          }}
                        >
                          {" "}
                          {t.change24h >= 0 ? "+" : ""}
                          {t.change24h.toFixed(1)}%
                        </span>
                      ) : null}
                    </>
                  ) : (
                    t.symbol
                  )}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

/* Shaped like the coin rows it stands in for. */
function CoinRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 md:gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 md:min-h-9 md:p-2"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton radius="full" className="h-8 w-8 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <Skeleton radius="sm" className="h-2.5 w-14" />
              <Skeleton radius="sm" className="h-2 w-24" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton radius="sm" className="h-2.5 w-16" />
            <Skeleton radius="sm" className="h-2 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}
