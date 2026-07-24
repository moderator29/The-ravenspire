"use client";

import { Icon } from "@/components/ui/icon";
import {
  PriceMiniCard,
  WalletMiniCard,
  RealmPulseCard,
  SuggestionChips,
} from "@/components/raven/cards";
import type { Msg } from "@/components/raven/types";

/* The Herald speaks in plain prose, but if the model ever slips a little
   markdown in, we strip it on display so a member never reads a literal
   "**" or "###". Purely cosmetic — the words are untouched. */
function tidyProse(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

const OPENERS = [
  "Settle a debate for me",
  "What is $ETH doing today?",
  "Announce my arrival to the realm",
  "Roast me, but kindly",
];

function RavenAvatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-panel-warm">
      <Icon name="raven" className="h-4 w-4 text-gold" />
    </div>
  );
}

export function MessageList({
  messages,
  busy,
  onSend,
}: {
  messages: Msg[];
  busy: boolean;
  onSend: (text: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
          <Icon name="raven" className="h-7 w-7 text-gold" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-bone">
            The rookery is quiet
          </p>
          <p className="mt-1 text-sm text-bone-mut">
            Nothing has been asked yet. The Raven waits on its perch.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {OPENERS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onSend(o)}
              className="btn-glass rounded-full px-3.5 py-1.5 text-xs text-bone"
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-1">
      {messages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={i} className="flex justify-end">
              <div className="glass-sm max-w-[85%] px-4 py-2.5 text-sm leading-relaxed text-bone">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          );
        }
        if (m.role === "error") {
          return (
            <div key={i} className="flex justify-start">
              <div className="flex max-w-[90%] items-start gap-2.5">
                <RavenAvatar />
                <div className="glass-sm border border-ember-deep/40 px-4 py-2.5 text-sm leading-relaxed text-bone-mut">
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="flex justify-start">
            <div className="flex max-w-[90%] items-start gap-2.5">
              <RavenAvatar />
              <div className="min-w-0">
                <div className="text-sm leading-relaxed text-bone">
                  <p className="whitespace-pre-wrap break-words">
                    {tidyProse(m.content)}
                  </p>
                </div>

                {/* Browsing surfaced honestly */}
                {m.browsed && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-panel-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                    <Icon name="search" className="h-3 w-3" />
                    Browsed the web
                  </span>
                )}
                {!m.browsed &&
                  m.browseRequested &&
                  m.browseAvailable === false && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-steel-line/70 bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-faint">
                      <Icon name="search" className="h-3 w-3" />
                      Browsing unavailable
                    </span>
                  )}

                {/* Sources */}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                      Sources
                    </span>
                    <ul className="flex flex-col gap-1">
                      {m.sources.map((s, j) => (
                        <li key={`${s.url}-${j}`}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-bone-mut transition-colors hover:text-gold"
                          >
                            <Icon
                              name="compass"
                              className="h-3 w-3 shrink-0 text-gold/70"
                            />
                            <span className="truncate">{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(m.cards || m.walletCard || m.pulse) && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {m.cards?.map((c, j) => (
                      <PriceMiniCard
                        key={`${c.symbol}-${j}`}
                        symbol={c.symbol}
                        name={c.name}
                        priceUsd={c.priceUsd}
                        change24h={c.change24h}
                        marketCap={c.marketCap}
                        chain={c.chain}
                        swapHref="/soon/mint"
                      />
                    ))}
                    {m.walletCard && (
                      <WalletMiniCard
                        address={m.walletCard.address}
                        totalUsd={m.walletCard.totalUsd}
                        holdings={m.walletCard.holdings}
                      />
                    )}
                    {m.pulse && <RealmPulseCard pulse={m.pulse} />}
                  </div>
                )}

                {m.suggestions && m.suggestions.length > 0 && (
                  <SuggestionChips
                    suggestions={m.suggestions}
                    onSelect={(t) => onSend(t)}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
      {busy && (
        <div className="flex justify-start">
          <div className="flex items-center gap-2.5">
            <RavenAvatar />
            <div className="flex items-center gap-1.5 py-2">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold/70"
                  style={{ animationDelay: `${d * 200}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
