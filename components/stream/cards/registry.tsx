"use client";

import type { ComponentType } from "react";
import { PostCard } from "@/components/social/post-card";
import { CallResolvedCard } from "@/components/stream/cards/call-resolved";
import { CrestEarnedCard } from "@/components/stream/cards/crest-earned";
import { DuelOpenedCard } from "@/components/stream/cards/duel-opened";
import { HouseOvertakeCard } from "@/components/stream/cards/house-overtake";
import { OathSwornCard } from "@/components/stream/cards/oath-sworn";
import { QuestCompletedCard } from "@/components/stream/cards/quest-completed";
import type { FeedEvent, FeedItem } from "@/lib/feed/types";

/* The card registry (V2 section 6.2).
 *
 * One map from event kind to the component that draws it. Adding a tenth kind
 * to the Ravenry is one new file and one line here; it is never a change to the
 * feed, the route or the merge. That is the whole point of the registry, and it
 * is what lets the stream grow without the feed becoming a switch statement
 * nobody dares touch.
 *
 * A kind with no entry renders nothing at all. That is deliberate and it is the
 * safe direction: the server already limits the stream to kinds that have both
 * a producer and a card (FEED_EVENT_KINDS), so an unmapped kind reaching here
 * means a card was removed or a payload changed shape, and an honest gap in the
 * timeline beats a card drawn from nothing.
 *
 * Two kinds on the spine are deliberately absent:
 *
 *   call.sealed        the post that sealed the Call is already in this feed,
 *                      carrying the same ember rail and a chart, so a card here
 *                      would double every Call in the timeline.
 *   season.milestone   emitted by nothing today. Cards are built for producers
 *   raven.chronicle    that exist, never ahead of them.
 *
 * Seven more things the directive asks for (House announcements, leaderboards,
 * trending discussions, community events, game invitations, reward
 * announcements, world events) have no producer at all yet, so they have no
 * card. A card with no real source could only be filled with invented data. */

export const CARD_REGISTRY: Record<
  string,
  ComponentType<{ event: FeedEvent }>
> = {
  "call.resolved": CallResolvedCard,
  "crest.earned": CrestEarnedCard,
  "house.overtake": HouseOvertakeCard,
  "duel.opened": DuelOpenedCard,
  "quest.completed": QuestCompletedCard,
  "oath.sworn": OathSwornCard,
};

/* One feed item, whatever it turns out to be. The Ravenry maps over this and
   knows nothing else about card types. */
export function FeedItemCard({ item }: { item: FeedItem }) {
  if (item.type === "post") return <PostCard post={item.post} />;
  const Card = CARD_REGISTRY[item.event.kind];
  if (!Card) return null;
  return <Card event={item.event} />;
}
