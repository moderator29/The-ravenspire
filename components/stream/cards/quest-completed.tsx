"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ActorName,
  CARD_ACTION_CLASS,
  CardFact,
  CardFacts,
  SystemCard,
  payloadNumber,
  payloadText,
} from "@/components/stream/cards/card-shell";
import type { FeedEvent } from "@/lib/feed/types";

/* A quest, completed.
 *
 * The quietest card in the registry, and it should stay that way: quests are
 * the most frequent thing the spine emits, so a quest card that competed with
 * a member's raven would be the fastest way to make the Ravenry unreadable.
 * Steel rail, one line, and the two amounts that were actually granted.
 *
 * Granted, not offered: the payload carries what the award returned after the
 * daily allowance was applied, so a member who has spent their allowance is
 * told the truth rather than the quest's advertised price. */

export function QuestCompletedCard({ event }: { event: FeedEvent }) {
  const name =
    payloadText(event.payload, "name") ??
    payloadText(event.payload, "quest_slug");
  if (!name) return null;

  const points = payloadNumber(event.payload, "points");
  const glory = payloadNumber(event.payload, "glory");
  const handle = event.actor?.handle ?? null;

  return (
    <SystemCard
      at={event.created_at}
      icon="check"
      label="Quest"
      action={
        handle ? (
          <Button
            variant="ghost"
            size="md"
            render={<Link href={`/u/${handle}`} />}
            className={CARD_ACTION_CLASS}
          >
            Visit the Keep
          </Button>
        ) : undefined
      }
    >
      <p>
        <ActorName event={event} /> completed{" "}
        <span className="font-medium text-bone">{name}</span>.
      </p>
      {(points !== null && points > 0) || (glory !== null && glory > 0) ? (
        <CardFacts>
          {points !== null && points > 0 ? (
            <CardFact label="Points" tone="gold" value={`+${points}`} />
          ) : null}
          {glory !== null && glory > 0 ? (
            <CardFact label="Glory" tone="gold" value={`+${glory}`} />
          ) : null}
        </CardFacts>
      ) : null}
    </SystemCard>
  );
}
