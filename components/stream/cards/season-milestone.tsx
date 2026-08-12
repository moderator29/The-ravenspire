"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CARD_ACTION_CLASS,
  CardFact,
  CardFacts,
  SystemCard,
  payloadNumber,
  payloadText,
} from "@/components/stream/cards/card-shell";
import type { FeedEvent } from "@/lib/feed/types";

/* The realm's calendar turning.
 *
 * This is the directive's "world events" card: realm wide, with no single actor
 * behind it. It is also the producer season.milestone has been missing since
 * the spine was written, which is why that kind sat in EVENT_KINDS with nothing
 * emitting it and nothing drawing it.
 *
 * Three phases, one card, because they are the same event at three points and
 * splitting them into three kinds would put three near-identical files in the
 * registry:
 *
 *   opened    a season begins and every House's score resets to what it earns
 *   closed    the window shuts and no further contribution counts
 *   settled   the standings freeze into season_settlements, server side
 *
 * `settled` carries the only reward figures the realm publishes. They are
 * aggregate on purpose. A per member payout card is deliberately not built:
 * publishing one member's earned balance to the realm is a privacy decision
 * nobody has made, and rule 7 constrains how a balance may be shown at all.
 * Points, never $RSP, in keeping with the same rule. */

const COPY: Record<
  string,
  { label: string; icon: string; sentence: (name: string) => string }
> = {
  opened: {
    label: "A season begins",
    icon: "scroll",
    sentence: (name) =>
      `${name} is open. Every Call sealed and every duel won from here counts toward your House.`,
  },
  closed: {
    label: "A season closes",
    icon: "scroll",
    sentence: (name) =>
      `${name} has closed. Nothing further counts toward it, and the standings hold until they are settled.`,
  },
  settled: {
    label: "A season is settled",
    icon: "medal",
    sentence: (name) => `${name} is settled. The standings are final.`,
  },
};

export function SeasonMilestoneCard({ event }: { event: FeedEvent }) {
  const phase = payloadText(event.payload, "phase");
  const copy = phase ? COPY[phase] : undefined;
  /* An unknown phase is a payload this card cannot describe, and describing it
     anyway would mean inventing which way the calendar turned. */
  if (!copy) return null;

  const seasonId = payloadNumber(event.payload, "season_id");
  const name = payloadText(event.payload, "name") ?? (seasonId !== null ? `Season ${seasonId}` : null);
  if (!name) return null;

  const members = payloadNumber(event.payload, "members");
  const totalPoints = payloadNumber(event.payload, "total_points");

  return (
    <SystemCard
      event={event}
      icon={copy.icon}
      label={copy.label}
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
      <p>{copy.sentence(name)}</p>

      {phase === "settled" && (members !== null || totalPoints !== null) ? (
        <CardFacts>
          {members !== null ? (
            <CardFact label="Members" value={members.toLocaleString()} />
          ) : null}
          {totalPoints !== null ? (
            <CardFact
              label="Points"
              value={totalPoints.toLocaleString()}
              tone="gold"
            />
          ) : null}
        </CardFacts>
      ) : null}
    </SystemCard>
  );
}
