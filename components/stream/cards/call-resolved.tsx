"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

/* A Call, settled.
 *
 * The single most important card in the Ravenry: it is the moment the realm
 * finds out whether somebody was right, which is the whole premise of Calls.
 * Ember rail, because a Call is ember whether it is open or resolving, and the
 * post that sealed it carries the same rail one screen up.
 *
 * Everything here is settled fact from the payload the resolver wrote: the
 * price it was sealed at, the price it settled at, and the Renown the score
 * minted. The move is arithmetic on those two prices, not an estimate. A Call
 * whose payload cannot answer one of them simply does not show that fact. */

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toPrecision(2)}`;
  return `$${n}`;
}

export function CallResolvedCard({ event }: { event: FeedEvent }) {
  const verdict = payloadText(event.payload, "verdict");
  /* Only a settled Call is a verdict. Anything else is not this card. */
  if (verdict !== "hit" && verdict !== "miss") return null;

  const hit = verdict === "hit";
  const token = payloadText(event.payload, "token");
  const stance = payloadText(event.payload, "stance");
  const timeframe = payloadText(event.payload, "timeframe");
  const entry = payloadNumber(event.payload, "entry_price");
  const settled = payloadNumber(event.payload, "settled_price");
  const score = payloadNumber(event.payload, "score");
  /* A Call sealed before the difficulty baseline existed scored nothing, and
     saying otherwise would be scoring a member against a world they never
     saw. */
  const legacy = payloadText(event.payload, "score_basis") === "legacy";
  const move =
    entry !== null && settled !== null && entry > 0
      ? ((settled - entry) / entry) * 100
      : null;

  return (
    <SystemCard
      event={event}
      rail="ember"
      icon="target"
      label="Verdict"
      trailing={
        <Badge variant={hit ? "gold" : "danger"}>
          {hit ? "Hit" : "Miss"}
        </Badge>
      }
      action={
        event.subject_type === "post" && event.subject_id ? (
          <Button
            variant="glass"
            size="md"
            render={<Link href={`/post/${event.subject_id}`} />}
            className={CARD_ACTION_CLASS}
          >
            Read the Call
          </Button>
        ) : undefined
      }
    >
      <p>
        <ActorName event={event} />
        {token ? (
          <>
            {" called "}
            <span className="font-medium text-bone">${token}</span>
            {stance === "up" ? " to rise" : stance === "down" ? " to fall" : ""}
            {timeframe ? ` within ${timeframe}` : ""}
            {hit ? ", and the market agreed." : ", and the market did not."}
          </>
        ) : (
          <>{hit ? " called it, and was proven right." : " called it, and was proven wrong."}</>
        )}
      </p>
      <CardFacts>
        {entry !== null ? (
          <CardFact label="Sealed" value={formatPrice(entry)} />
        ) : null}
        {settled !== null ? (
          <CardFact label="Settled" value={formatPrice(settled)} />
        ) : null}
        {move !== null ? (
          <CardFact
            label="Move"
            tone={move >= 0 ? "up" : "down"}
            value={`${move >= 0 ? "+" : ""}${move.toFixed(2)}%`}
          />
        ) : null}
        {!legacy && score !== null && score > 0 ? (
          <CardFact
            label="Renown"
            tone="gold"
            value={`+${score.toFixed(1)}`}
          />
        ) : null}
      </CardFacts>
    </SystemCard>
  );
}
