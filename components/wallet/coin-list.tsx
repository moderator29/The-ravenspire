"use client";

import { useMemo } from "react";
import { Icon } from "@/components/ui/icon";
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
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icon name="coin" className="h-4 w-4 text-gold" />
          <h2 className="font-display text-base font-semibold text-bone">
            Tokens
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <TokenFilter value={filters} onChange={onFilters} />
          <button
            type="button"
            onClick={onManage}
            aria-label="Manage tokens"
            className="btn-glass inline-flex h-8 items-center gap-1.5 px-2.5 text-xs"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Manage
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {loading && tokens.length === 0 ? (
          <>
            <div className="glass-sm h-16 animate-pulse rounded-2xl" />
            <div className="glass-sm h-16 animate-pulse rounded-2xl" />
            <div className="glass-sm h-16 animate-pulse rounded-2xl" />
          </>
        ) : !configured ? (
          <Empty
            title="Balances are resting"
            body="The balances provider is not configured in this environment, so live token balances cannot be read right now."
          />
        ) : error ? (
          <Empty
            title="Could not read balances"
            body="The balances provider did not answer just now. Pull to refresh in a moment."
          />
        ) : visible.length === 0 ? (
          <Empty
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
              className="group flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3 text-left transition-colors hover:border-gold/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0">
                  <TokenLogo logo={t.logo} symbol={t.symbol} size={40} />
                  <span className="absolute -bottom-1 -right-1 rounded-full border border-obsidian bg-panel-warm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-gold">
                    {t.chainShort}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-bone">
                    {t.symbol}
                  </p>
                  <p className="truncate text-xs text-bone-faint">{t.name}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-sm font-semibold text-bone">
                  {t.balanceDisplay}
                </p>
                <p className="tnum text-xs text-bone-faint">
                  {t.quoteUsd > 0 ? (
                    <>
                      ${t.quoteUsd.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      {t.change24h !== 0 ? (
                        <span
                          className={
                            t.change24h >= 0 ? "text-gold" : "text-ember"
                          }
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
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-steel-line bg-panel/25 p-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-steel-line bg-panel/60">
        <Icon name="coin" className="h-5 w-5 text-bone-faint" />
      </span>
      <p className="text-sm font-medium text-bone-mut">{title}</p>
      <p className="max-w-xs text-xs text-bone-faint">{body}</p>
    </div>
  );
}
