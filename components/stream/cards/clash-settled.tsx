"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

/* A Clash decided.
 *
 * The other half of clash.opened, and the half that never existed. Clashes
 * have had a window, a subject and a live scoreboard since Houses V2, and
 * absolutely nothing happened when one closed: a finished Clash looked exactly
 * like an abandoned one, and the board quietly went on recomputing itself
 * forever from Calls that members could still edit or delete. A competition
 * nobody announces the end of is a competition nobody was really in.
 *
 * The result on this card is the FROZEN one, read from house_clash_results at
 * settlement, which is why the figures here can be trusted to still be true a
 * year from now.
 *
 * Ledger register, deliberately, and this is the interesting judgement on the
 * card. A House winning something is exactly the kind of moment the Forge
 * register exists for, and house.overtake already takes it. But a Clash
 * settles every single week, forever, and ornament that arrives on a schedule
 * is ornament nobody looks at twice. The rule is that ornament is earned and
 * never ambient; a weekly fixture is the definition of ambient. So the Clash
 * result is quiet, and the House overtaking a rival stays loud.
 *
 * No actor. A Clash is settled by the calendar, and there is no member to
 * attribute it to. */

export function ClashSettledCard({ event }: { event: FeedEvent }) {
  const title = payloadText(event.payload, "title");
  /* Without a name there is nothing to announce the result of, and a card that
     cannot say which Clash it means should not be drawn. */
  if (!title) return null;

  const winnerName = payloadText(event.payload, "winner_name");
  const winnerScore = payloadNumber(event.payload, "winner_score") ?? 0;
  const entrants = payloadNumber(event.payload, "entrant_houses") ?? 0;
  const token = payloadText(event.payload, "token");

  return (
    <SystemCard
      at={event.created_at}
      icon="swords"
      label="A Clash is decided"
      rail="steel"
      trailing={<Badge>Final</Badge>}
      action={
        <Button
          variant="glass"
          size="md"
          render={<Link href="/houses?view=clashes" />}
          className={CARD_ACTION_CLASS}
        >
          See the result
        </Button>
      }
    >
      <p>
        <span className="font-semibold text-bone">{title}</span>{" "}
        {winnerName ? (
          <>
            closed with{" "}
            <span className="font-semibold text-gold">{winnerName}</span> ahead.
            The board is frozen and will not move again.
          </>
        ) : (
          /* The honest ending, and the one a scheduled weekly fixture in a
             young realm will produce most often. No House entered, so no House
             won, and saying so is the only alternative to crowning somebody who
             did nothing. */
          <>closed with no Calls sealed inside its window, so no House took it.</>
        )}
      </p>

      <CardFacts>
        {token ? <CardFact label="Subject" value={`$${token}`} /> : null}
        {winnerName ? (
          <CardFact
            label="Winning score"
            value={winnerScore.toLocaleString()}
            tone="gold"
          />
        ) : null}
        {entrants > 0 ? (
          <CardFact
            label="Houses entered"
            value={String(entrants)}
          />
        ) : null}
      </CardFacts>
    </SystemCard>
  );
}
