import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* The Realm Event Spine (V2 section 6.1).

   Every meaningful act anywhere in the realm emits one row here, and the
   Ravenry renders that stream. This is the single change that lets the Ledger,
   the Watch, the War and the Calls surface start producing something other
   people can see, without any of them changing shape.

   emit() deliberately mirrors award() in lib/points.ts: server-only, takes the
   service-role client the caller already holds, and does one write. The
   difference is that emit() never throws. An event is a record of something
   that already happened, so a failed emit must never fail the request that
   caused it. Call it inside after() from next/server and the member never waits
   on it either. */

export const EVENT_KINDS = [
  "call.sealed",
  "call.resolved",
  "crest.earned",
  "house.overtake",
  "duel.opened",
  "quest.completed",
  "oath.sworn",
  "season.milestone",
  "raven.chronicle",
  /* The realm speaking about itself rather than about one member. None of
     these has an actor, and all four are derived from something the product
     already stores, never from a new source invented to fill a card. */
  "standings.snapshot",
  "clash.opened",
  "discussion.trending",
] as const;

export type RealmEventKind = (typeof EVENT_KINDS)[number];

/* Who the event is for.
     realm     everyone, including signed-out visitors
     house     the actor's House only
     followers the actor's followers only
     actor     the actor alone, a private record

   This is enforced in the database: the realm_events RLS policy exposes only
   audience = 'realm' to the browser roles, and GET /api/events applies the
   narrower audiences with the service-role client. */
export type RealmEventAudience = "realm" | "house" | "followers" | "actor";

export type RealmSubjectType =
  | "post"
  | "profile"
  | "house"
  | "duel"
  | "quest"
  | "crest"
  | "season"
  | "clash";

export interface RealmEvent {
  kind: RealmEventKind;
  /* The member who caused it. Null for world events no single member authored. */
  actorId?: string | null;
  subjectType?: RealmSubjectType | null;
  /* Text rather than uuid: a subject may be a post id, a house slug, a crest
     slug, or a composite key such as 'first-blood:2026-W33'. */
  subjectId?: string | null;
  houseSlug?: string | null;
  /* Kind-specific and versioned by the `v` field the caller sets. Keep it small
     and denormalised: a feed card should render from the payload alone without
     a second round trip. */
  payload?: Record<string, unknown>;
  audience?: RealmEventAudience;
}

/* Postgres unique violation. realm_events_once_idx makes the once-only kinds
   idempotent, so a retried request or a re-run cron produces one card, not two.
   Hitting it is the index doing its job, not an error worth logging. */
const UNIQUE_VIOLATION = "23505";

export async function emit(
  db: SupabaseClient,
  event: RealmEvent
): Promise<void> {
  try {
    const { error } = await db.from("realm_events").insert({
      kind: event.kind,
      actor_id: event.actorId ?? null,
      subject_type: event.subjectType ?? null,
      subject_id: event.subjectId ?? null,
      house_slug: event.houseSlug ?? null,
      payload: event.payload ?? {},
      audience: event.audience ?? "realm",
    });
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error("[realm-events] emit failed", event.kind, error.message);
    }
  } catch (err) {
    /* Never propagate. The act already happened; only the record of it failed. */
    console.error("[realm-events] emit threw", event.kind, err);
  }
}

/* Emit several events as one insert. Same guarantees as emit(); used where a
   single settlement pass produces a batch. */
export async function emitMany(
  db: SupabaseClient,
  events: RealmEvent[]
): Promise<void> {
  if (events.length === 0) return;
  try {
    const { error } = await db.from("realm_events").insert(
      events.map((event) => ({
        kind: event.kind,
        actor_id: event.actorId ?? null,
        subject_type: event.subjectType ?? null,
        subject_id: event.subjectId ?? null,
        house_slug: event.houseSlug ?? null,
        payload: event.payload ?? {},
        audience: event.audience ?? "realm",
      }))
    );
    /* A batch insert is all-or-nothing, so one duplicate loses the whole batch.
       Fall back to inserting them one at a time, where the unique index only
       drops the rows that genuinely already exist. */
    if (error) {
      if (error.code !== UNIQUE_VIOLATION) {
        console.error("[realm-events] emitMany failed", error.message);
      }
      for (const event of events) await emit(db, event);
    }
  } catch (err) {
    console.error("[realm-events] emitMany threw", err);
  }
}

/* A stored row, as GET /api/events returns it. */
export interface RealmEventRow {
  id: string;
  kind: string;
  actor_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  house_slug: string | null;
  payload: Record<string, unknown>;
  audience: string;
  created_at: string;
}
