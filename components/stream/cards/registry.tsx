"use client";

import type { ComponentType } from "react";
import { PostCard } from "@/components/social/post-card";
import { CallResolvedCard } from "@/components/stream/cards/call-resolved";
import { ChronicleCard } from "@/components/stream/cards/chronicle";
import { ClashOpenedCard } from "@/components/stream/cards/clash-opened";
import { ClashSettledCard } from "@/components/stream/cards/clash-settled";
import { CrestEarnedCard } from "@/components/stream/cards/crest-earned";
import { DiscussionTrendingCard } from "@/components/stream/cards/discussion-trending";
import { DuelOpenedCard } from "@/components/stream/cards/duel-opened";
import { HouseOvertakeCard } from "@/components/stream/cards/house-overtake";
import { OathSwornCard } from "@/components/stream/cards/oath-sworn";
import { QuestCompletedCard } from "@/components/stream/cards/quest-completed";
import { SeasonMilestoneCard } from "@/components/stream/cards/season-milestone";
import { StandingsSnapshotCard } from "@/components/stream/cards/standings-snapshot";
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
 * One kind on the spine is deliberately absent:
 *
 *   call.sealed   the post that sealed the Call is already in this feed,
 *                 carrying the same ember rail and a chart, so a card here
 *                 would double every Call in the timeline.
 *
 * Four of the directive's seven queued cards arrived together, each with a
 * producer over data the product already stores rather than a new source
 * invented to fill a card:
 *
 *   standings.snapshot    the weekly standings, written by the House recompute
 *                         that already computes them. A snapshot, never a live
 *                         table, which section 8 is explicit about.
 *   clash.opened          the realm's community event. A Clash was already
 *                         scheduled, bounded, realm wide and admin authored;
 *                         it only lacked anyone being told.
 *   season.milestone      the world event, and the producer this kind had been
 *                         waiting for since the spine was written.
 *   discussion.trending   derived from reply and reaction velocity, with the
 *                         floors in lib/feed/trending.ts and no card at all
 *                         below them.
 *
 * The other three were judged not worth building, and the reasons are recorded
 * rather than left implicit, because "not yet" and "never" are different
 * answers:
 *
 *   House announcements   the product already has them. A house-visibility
 *                         raven from a titled member IS a House announcement,
 *                         and it is already in this feed for that House, so a
 *                         second card would double it exactly the way
 *                         call.sealed would. What is missing is prominence in
 *                         the House hall, which is a Dossier concern.
 *   Game invitations      the War is single player. There is no lobby, no
 *                         matchmaking and no opponent, and the only
 *                         invitational mechanic in the realm is a duel, which
 *                         duel.opened already draws. A card here would need a
 *                         multiplayer mode built first.
 *   Reward announcements  the realm-wide half is season.milestone at settle.
 *                         The per member half would publish a member's earned
 *                         balance to the realm, which is a privacy decision
 *                         nobody has made and which rule 7 constrains. */

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
  "raven.chronicle": ChronicleCard,
  "standings.snapshot": StandingsSnapshotCard,
  "clash.opened": ClashOpenedCard,
  "clash.settled": ClashSettledCard,
  "season.milestone": SeasonMilestoneCard,
  "discussion.trending": DiscussionTrendingCard,
};

/* One feed item, whatever it turns out to be. The Ravenry maps over this and
   knows nothing else about card types. */
export function FeedItemCard({ item }: { item: FeedItem }) {
  if (item.type === "post") return <PostCard post={item.post} />;
  const Card = CARD_REGISTRY[item.event.kind];
  if (!Card) return null;
  return <Card event={item.event} />;
}
