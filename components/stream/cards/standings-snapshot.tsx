"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  CARD_ACTION_CLASS,
  CardFact,
  CardFacts,
  SystemCard,
  payloadNumber,
  payloadText,
} from "@/components/stream/cards/card-shell";
import { houseBySlug } from "@/lib/data/houses";
import type { FeedEvent } from "@/lib/feed/types";

/* The weekly standings, as a moment rather than a table.
 *
 * Section 8 asks for a leaderboard in the Ravenry and then says exactly what it
 * must not be: "a periodic standings snapshot card, not a live table in the
 * feed". The distinction is the whole design. A live table in a stream is a
 * widget a reader scrolls past, it has no place in a timeline because it is not
 * a thing that happened, and it puts a second copy of the Board archetype in
 * the one column the design system reserves for Stream. A snapshot is an event:
 * it happened at a time, it sits at that time, and it says what the week did.
 *
 * Three Houses, not six. A card that lists every House is the table this is
 * meant not to be, and the full standings are one tap away.
 *
 * Ledger register. This appears every week, and ornament is earned rather than
 * ambient; the Forge is for a House overtaking a rival, which is the moment
 * this card's numbers are the background to. */

interface Row {
  slug: string;
  rank: number;
  score: number;
}

function rows(payload: Record<string, unknown>): Row[] {
  const raw = payload["houses"];
  if (!Array.isArray(raw)) return [];
  const out: Row[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const slug = typeof r.slug === "string" ? r.slug : null;
    const rank = typeof r.rank === "number" ? r.rank : null;
    const score = typeof r.score === "number" ? r.score : null;
    if (!slug || rank === null || score === null) continue;
    out.push({ slug, rank, score });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export function StandingsSnapshotCard({ event }: { event: FeedEvent }) {
  const houses = rows(event.payload);
  /* One House is not a standing and no Houses is not a card. The producer
     already refuses to write either, and this is the second gate: a payload
     that lost its rows renders nothing rather than an empty frame. */
  if (houses.length < 2) return null;

  const week = payloadText(event.payload, "week");
  const lead = payloadNumber(event.payload, "lead");
  const topN = payloadNumber(event.payload, "top_n");

  return (
    <SystemCard
      at={event.created_at}
      icon="medal"
      label={week ? `Standings, ${week}` : "Standings"}
      action={
        <Button
          variant="glass"
          size="md"
          render={<Link href="/houses" />}
          className={CARD_ACTION_CLASS}
        >
          See the standings
        </Button>
      }
    >
      <ol className="mt-0.5 flex flex-col gap-1.5">
        {houses.map((row) => {
          const house = houseBySlug(row.slug);
          return (
            <li key={row.slug} className="flex items-center gap-2.5">
              <span className="tnum w-4 shrink-0 text-center text-xs text-bone-faint">
                {row.rank}
              </span>
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                style={
                  house
                    ? {
                        background: `linear-gradient(160deg, ${house.color}22, #101017)`,
                        border: `1px solid ${house.color}44`,
                        color: house.color,
                      }
                    : undefined
                }
              >
                <Icon name="banner" className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-bone">
                {house?.name ?? row.slug}
              </span>
              <span className="tnum shrink-0 font-medium text-gold">
                {row.score.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ol>

      {lead !== null || topN !== null ? (
        <CardFacts>
          {lead !== null ? (
            <CardFact
              label="Lead"
              value={lead === 0 ? "level" : lead.toLocaleString()}
              tone="gold"
            />
          ) : null}
          {topN !== null ? (
            <CardFact label="Counting" value={`top ${topN}`} secondary />
          ) : null}
        </CardFacts>
      ) : null}
    </SystemCard>
  );
}
