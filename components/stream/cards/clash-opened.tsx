"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CARD_ACTION_CLASS,
  CardFact,
  CardFacts,
  SystemCard,
  payloadText,
} from "@/components/stream/cards/card-shell";
import type { FeedEvent } from "@/lib/feed/types";

/* A Clash called.
 *
 * This is the directive's "community events" card, and it needed no new table.
 * A Clash is already the only thing in the realm that is scheduled, bounded,
 * realm wide and authored by a person: a 48 hour window on one nominated token
 * or theme, where only Calls made inside it count. That is a community event
 * by any definition, and it has had a table, an admin authoring path and a live
 * scoreboard since Houses V2. What it lacked was anyone being told.
 *
 * The window travels in the payload, so the card can say honestly what the
 * Clash is doing right now without a second read. A card written on Monday and
 * scrolled past on Thursday must not still say "opens in two days", which is
 * why the phase is computed at render rather than stored.
 *
 * No actor. The stewards call a Clash on the realm's behalf, and naming the
 * steward who typed it would make an announcement read as one member's act. */

type Phase = "upcoming" | "live" | "closed";

function phaseOf(startsAt: string | null, endsAt: string | null): Phase | null {
  if (!startsAt || !endsAt) return null;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const now = Date.now();
  if (now < start) return "upcoming";
  if (now > end) return "closed";
  return "live";
}

/* How long is left, in the coarsest honest unit. Never counts past a close. */
function remaining(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3.6e6);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hours`;
  return `${Math.max(1, Math.floor(ms / 6e4))} minutes`;
}

export function ClashOpenedCard({ event }: { event: FeedEvent }) {
  const title = payloadText(event.payload, "title");
  const startsAt = payloadText(event.payload, "starts_at");
  const endsAt = payloadText(event.payload, "ends_at");
  const phase = phaseOf(startsAt, endsAt);
  /* Without a name and a window this is not a Clash a member could act on, and
     a card that cannot say when is a card that should not be drawn. */
  if (!title || !phase || !endsAt || !startsAt) return null;

  const token = payloadText(event.payload, "token");
  const theme = payloadText(event.payload, "theme");
  const left =
    phase === "live"
      ? remaining(endsAt)
      : phase === "upcoming"
        ? remaining(startsAt)
        : null;

  return (
    <SystemCard
      event={event}
      icon="swords"
      label="A Clash is called"
      rail="ember"
      trailing={
        phase === "live" ? (
          <Badge variant="gold" icon="flame">
            Live
          </Badge>
        ) : phase === "upcoming" ? (
          <Badge>Upcoming</Badge>
        ) : (
          <Badge>Closed</Badge>
        )
      }
      action={
        <Button
          variant="glass"
          size="md"
          render={<Link href="/houses?view=clashes" />}
          className={CARD_ACTION_CLASS}
        >
          {phase === "closed" ? "See how it went" : "See the scoreboard"}
        </Button>
      }
    >
      <p>
        <span className="font-semibold text-bone">{title}</span>
        {token ? (
          <>
            {" "}
            Every Call sealed on{" "}
            <span className="font-medium text-bone">${token}</span> inside the
            window counts toward its House.
          </>
        ) : theme ? (
          <>
            {" "}
            Every Call sealed inside the window counts toward its House.
          </>
        ) : null}
      </p>

      <CardFacts>
        {theme && !token ? <CardFact label="Theme" value={theme} /> : null}
        {left ? (
          <CardFact
            label={phase === "live" ? "Closes in" : "Opens in"}
            value={left}
            tone="gold"
          />
        ) : null}
      </CardFacts>
    </SystemCard>
  );
}
