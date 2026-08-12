import type { Post } from "@/lib/social/types";
import type { Author } from "@/lib/social/types";

/* What the Ravenry is made of.
 *
 * The feed used to be an array of ravens. It is now two sources interleaved by
 * time: ravens from `posts`, and everything else that happened in the realm
 * from the event spine in `realm_events`. This union is the contract between
 * the server that merges them and the card registry that draws them, and it is
 * the only place a third source would ever have to be added.
 *
 * Every item carries `at`, the time it takes its position in the timeline
 * from. For a raven that is its creation time, or the moment it was re-ravened
 * when it reached the reader that way. For an event it is when the event
 * happened. Ordering, cursoring and paging all read `at` and nothing else.
 *
 * This module is deliberately free of any server import so a card can hold the
 * same type the route produced. */

/* A hydrated spine row: the stored event plus the member who caused it,
   resolved in one batched query rather than one per card. */
export interface FeedEvent {
  id: string;
  kind: string;
  actor_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  house_slug: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  /* Null for world events no single member authored, and for an actor whose
     profile has since been removed. A card must survive both. */
  actor: (Author & { id: string }) | null;
}

export type FeedItem =
  | { type: "post"; id: string; at: string; post: Post }
  | { type: "event"; id: string; at: string; event: FeedEvent };

export function postItem(post: Post): FeedItem {
  return {
    type: "post",
    id: post.id,
    at: post.effectiveTime ?? post.created_at,
    post,
  };
}

export function eventItem(event: FeedEvent): FeedItem {
  return { type: "event", id: event.id, at: event.created_at, event };
}

/* A stable React key. A raven can legitimately appear twice in one timeline,
   once as itself and once as somebody's re-raven, so the time it took its
   position from is part of its identity. */
export function feedItemKey(item: FeedItem): string {
  return item.type === "post"
    ? `post:${item.id}:${item.at}`
    : `event:${item.id}`;
}

/* Who an item is attributed to, for the block and mute lists the reader keeps.
   Null when nobody authored it. */
export function feedItemActorId(item: FeedItem): string | null {
  return item.type === "post" ? item.post.author_id : item.event.actor_id;
}
