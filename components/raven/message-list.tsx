"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";
import {
  PriceMiniCard,
  WalletMiniCard,
  RealmPulseCard,
  SuggestionChips,
} from "@/components/raven/cards";
import type { Msg } from "@/components/raven/types";

/* The Herald speaks in plain prose, but if the model ever slips a little
   markdown in, we strip it on display so a member never reads a literal
   "**" or "###". Purely cosmetic, the words are untouched. */
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
    /* The opening screen of a conversation, not an empty state in a page.
       The distinction matters: an empty state reports an absence, and this
       reports readiness. So the Herald itself is the largest thing on the
       screen, the question is addressed to the member, and the openers are
       full width rows rather than a wrapped cluster of chips, because a
       thumb aims at a row and squints at a cluster. */
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8">
        <Icon3D name="herald-ai" size="hero" priority />
        <h2 className="mt-6 text-center font-display text-xl font-semibold text-bone sm:text-2xl">
          How can I help today?
        </h2>
        <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-bone-mut">
          Ask about any token, any wallet, or anything happening in the realm.
          Every figure is read from real data.
        </p>
        <div className="mt-7 flex w-full max-w-sm flex-col gap-2.5">
          {OPENERS.map((o) => (
            <Button
              key={o}
              variant="glass"
              size="lg"
              block
              className="justify-start text-left"
              onClick={() => onSend(o)}
            >
              <Icon name="spark" className="h-4 w-4 shrink-0 text-gold" />
              <span className="min-w-0 truncate">{o}</span>
            </Button>
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
              <Card
                variant="warm"
                pad="none"
                className="max-w-[85%] px-4 py-2.5 text-sm leading-relaxed text-bone"
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </Card>
            </div>
          );
        }
        if (m.role === "error") {
          return (
            <div key={i} className="flex justify-start">
              <div className="flex max-w-[90%] items-start gap-2.5">
                <RavenAvatar />
                <Card
                  pad="none"
                  tone="danger"
                  role="alert"
                  className="px-4 py-2.5 text-sm leading-relaxed text-bone-mut"
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </Card>
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
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-gold/30 bg-panel-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                    <Icon name="search" className="h-3 w-3" />
                    Browsed the web
                  </span>
                )}
                {!m.browsed &&
                  m.browseRequested &&
                  m.browseAvailable === false && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-steel-line/70 bg-panel px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-faint">
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
