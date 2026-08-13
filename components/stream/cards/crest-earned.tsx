"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ActorName,
  CARD_ACTION_CLASS,
  ForgeCard,
  payloadText,
} from "@/components/stream/cards/card-shell";
import type { FeedEvent } from "@/lib/feed/types";

/* A crest, earned.
 *
 * One of two cards in the Ravenry allowed the Forge register. A crest is rare,
 * permanent and until the spine existed nobody but its owner ever saw one, so
 * this is exactly the ceremony moment section 5 means by a bright gold rail
 * inlined into a Stream. It reads as special only because the cards above and
 * below it are flat, which is why this list is two cards long and not nine. */

export function CrestEarnedCard({ event }: { event: FeedEvent }) {
  const title =
    payloadText(event.payload, "title") ??
    payloadText(event.payload, "crest_slug");
  /* No crest named, no card. The alternative is a card that congratulates a
     member on nothing. */
  if (!title) return null;

  const handle = event.actor?.handle ?? null;

  return (
    <ForgeCard
      at={event.created_at}
      icon="trophy"
      label="Crest"
      action={
        handle ? (
          <Button
            variant="glass"
            size="md"
            render={<Link href={`/u/${handle}`} />}
            className={CARD_ACTION_CLASS}
          >
            Visit the Keep
          </Button>
        ) : (
          <Button
            variant="glass"
            size="md"
            render={<Link href="/renown" />}
            className={CARD_ACTION_CLASS}
          >
            See the crests
          </Button>
        )
      }
    >
      <p>
        <ActorName event={event} /> earned the{" "}
        <span className="font-semibold text-gold">{title}</span> crest.
      </p>
    </ForgeCard>
  );
}
