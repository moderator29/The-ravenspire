"use client";

import { SystemCard, payloadText } from "@/components/stream/cards/card-shell";
import { houseBySlug } from "@/lib/data/houses";
import type { FeedEvent } from "@/lib/feed/types";

/* The Herald's own proactive reaction (V2 platform sweep item 19), in the
 * Ravenry.
 *
 * Every other Herald surface answers when a member asks it something. This is
 * the first one that does not: recomputeSeason (lib/houses/scoring.ts) writes
 * it in the same pass that already writes house.overtake, immediately after
 * each one, so it can only ever appear beside a House genuinely passing
 * another, at most three times a pass, and the pass runs once a day.
 *
 * Ledger register, not Forge, on purpose, and against the pull of the moment
 * it is about. card-shell.tsx is explicit that the Forge list is two cards,
 * crest.earned and house.overtake, and does not grow: house.overtake already
 * carries the gold rail and the 3D icon for this exact moment, so a second
 * gilded card beside it would not read as a bigger celebration, it would
 * teach a reader that gold is ambient. This is commentary on an earned
 * moment, not the moment itself, which is precisely what the Ledger register
 * is for.
 *
 * No text of its own, the same posture ChronicleCard takes: the sentence is
 * the whole card, and a payload with no sentence renders nothing rather than
 * a card standing for a reaction the Herald never actually had. */

export function HeraldReactionCard({ event }: { event: FeedEvent }) {
  const text = payloadText(event.payload, "text");
  if (!text) return null;

  const house = houseBySlug(event.house_slug ?? null);

  return (
    <SystemCard
      at={event.created_at}
      icon="raven"
      label={house ? `The Herald, on ${house.name}` : "The Herald"}
      rail={house ? "house" : "steel"}
      {...(house ? { railColor: house.color } : {})}
    >
      <p>{text}</p>
    </SystemCard>
  );
}
