"use client";

import { Card } from "@/components/ui/card";
import {
  ActorName,
  SystemCard,
  payloadText,
} from "@/components/stream/cards/card-shell";
import type { FeedEvent } from "@/lib/feed/types";

/* A duel, opened.
 *
 * A challenge used to be something you had to visit a page to discover, and
 * the page it lived on is dissolved. On the spine it lands here instead.
 *
 * It carries no action button, deliberately. There is no duel surface in the
 * product today, and a card that links to a page which cannot answer the
 * challenge is worse than a card that simply reports it. The action arrives
 * with the surface that can honour it, not before. */

export function DuelOpenedCard({ event }: { event: FeedEvent }) {
  const prompt = payloadText(event.payload, "prompt");
  if (!prompt) return null;
  const entry = payloadText(event.payload, "challenger_entry");

  return (
    <SystemCard event={event} icon="swords" label="Duel">
      <p>
        <ActorName event={event} /> opened a duel of wits.
      </p>
      <p className="mt-1.5 font-medium text-bone">{prompt}</p>
      {entry ? (
        /* The challenger's own words, recessed so they read as quoted rather
           than as the card speaking. */
        <Card variant="inset" pad="none" className="mt-2 px-3 py-2">
          <p className="line-clamp-4 whitespace-pre-line text-bone-mut">
            {entry}
          </p>
        </Card>
      ) : null}
    </SystemCard>
  );
}
