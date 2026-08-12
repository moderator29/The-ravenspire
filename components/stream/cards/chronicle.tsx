"use client";

import { SystemCard, payloadText } from "@/components/stream/cards/card-shell";
import { houseBySlug } from "@/lib/data/houses";
import type { FeedEvent } from "@/lib/feed/types";

/* The Chronicle, in the Ravenry.
 *
 * The Herald's daily entry, written by the cron job at /api/cron/chronicle over
 * counts read off the event spine. Two scopes share this card: the realm's own
 * entry, and a House's entry which only that House is in the audience for.
 *
 * Ledger register, deliberately. The Chronicle appears every day, and section
 * 21 of the house rules is explicit that ornament is earned rather than
 * ambient: a card that glows daily teaches a reader that gold means nothing.
 * The realm's voice earns its place by being the realm's voice, not by
 * shouting.
 *
 * No text of its own. The paragraph is the whole card, and if the payload has
 * no paragraph the card renders nothing rather than inventing a day. */

export function ChronicleCard({ event }: { event: FeedEvent }) {
  const text = payloadText(event.payload, "text");
  if (!text) return null;

  const scope = payloadText(event.payload, "scope");
  const house =
    scope === "house" ? houseBySlug(event.house_slug ?? null) : null;

  return (
    <SystemCard
      event={event}
      icon="raven"
      label={house ? `${house.name} today` : "The Chronicle"}
      rail={house ? "house" : "steel"}
      {...(house ? { railColor: house.color } : {})}
    >
      <p>{text}</p>
    </SystemCard>
  );
}
