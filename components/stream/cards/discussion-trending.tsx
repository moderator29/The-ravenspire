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

/* What the realm is arguing about.
 *
 * The only card in the registry whose subject is a raven that is probably
 * already in the same timeline, which is the risk this card has to earn its way
 * past. The `call.sealed` kind is excluded from the feed for exactly that
 * reason, so the rule is worth restating: a second card for the same thing is
 * only justified when it says something the first one cannot.
 *
 * This one does. A raven carries its own replies and reactions but it cannot
 * tell a reader that it is the busiest thing in the realm right now, and a
 * reader who scrolled past it yesterday has no way to learn it turned into a
 * discussion overnight. That is what this says, and it is why the card leads
 * with the numbers rather than with the words.
 *
 * The words are an excerpt and they are frozen at the moment the realm noticed.
 * That is deliberate: this is a record of what the realm was arguing about,
 * not a live mirror of a raven that may since have been edited. The action goes
 * to the raven itself, which is always current.
 *
 * Ledger register and a steel rail. A busy thread is not a Forge moment: the
 * Forge is for a Crest unlocking and a House overtaking a rival, and a card
 * that appears daily can never be one of them. */

export function DiscussionTrendingCard({ event }: { event: FeedEvent }) {
  const postId = payloadText(event.payload, "post_id");
  const replies = payloadNumber(event.payload, "replies");
  /* Without the raven there is nowhere to send anybody, and without a reply
     count there is no claim to make. Either missing means no card, because the
     alternative is a card announcing a discussion it cannot point at. */
  if (!postId || replies === null) return null;

  const excerpt = payloadText(event.payload, "excerpt");
  const handle = payloadText(event.payload, "author_handle");
  const name = payloadText(event.payload, "author_name") ?? (handle ? `@${handle}` : null);
  const reactions = payloadNumber(event.payload, "reactions");

  return (
    <SystemCard
      at={event.created_at}
      icon="reply"
      label="The realm is talking"
      action={
        <Button
          variant="glass"
          size="md"
          render={<Link href={`/post/${postId}`} />}
          className={CARD_ACTION_CLASS}
        >
          Read the thread
        </Button>
      }
    >
      <p>
        {name ? (
          <>
            {handle ? (
              <Link
                href={`/u/${handle}`}
                className="font-medium text-bone hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span className="font-medium text-bone">{name}</span>
            )}
            {" started "}
          </>
        ) : (
          "A raven started "
        )}
        the most argued thread in the realm.
      </p>

      {excerpt ? (
        <blockquote className="mt-2 border-l-2 border-steel-line pl-3 text-bone-faint">
          {excerpt}
        </blockquote>
      ) : null}

      <CardFacts>
        <CardFact label="Replies" value={replies.toLocaleString()} tone="gold" />
        {reactions !== null ? (
          <CardFact label="Reactions" value={reactions.toLocaleString()} secondary />
        ) : null}
      </CardFacts>
    </SystemCard>
  );
}
