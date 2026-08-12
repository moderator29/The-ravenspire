import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bucketKey, subjectKey } from "@/lib/calls/peers";
import { normalizeCall, type CallData } from "@/lib/calls/types";

/* Similar Calls and live discussion (V2 section 10, the row reading "Detect
   similar Calls and discussions: cheap with embeddings, or free with Postgres
   full text search. Build, prefer the free path").

   The free path is better than cheap here, and not only on cost. A Call already
   carries a pinned subject, a direction, a threshold band and a window, so
   "have people Called this before" is an exact structured match rather than a
   fuzzy one. An embedding would take that exact relation and blur it, then
   charge for the privilege.

   Three relations, ranked, and each one is a fact rather than a similarity
   score a member has to trust:

     same-claim      the same subject, direction, threshold band and window
     same-direction  the same subject and direction, stated differently
     same-subject    the same subject, called the other way

   Discussion is a separate free read: how much the realm has actually said
   about this subject lately, counted from the cashtags already stored on posts.

   Nothing here is written and nothing is invented. When the realm has said
   nothing, the honest answer is nothing. */

export type SimilarRelation = "same-claim" | "same-direction" | "same-subject";

const RELATION_RANK: Record<SimilarRelation, number> = {
  "same-claim": 3,
  "same-direction": 2,
  "same-subject": 1,
};

export interface SimilarRow {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  call: CallData | null;
}

export interface SimilarCall {
  id: string;
  authorId: string;
  createdAt: string;
  relation: SimilarRelation;
  /* Whether the caller is the member looking at it. Their own history is the
     most relevant thing on the list and the most misleading thing to present as
     the crowd, so the distinction is carried rather than smoothed away. */
  mine: boolean;
  token: string | null;
  stance: string;
  timeframe: string;
  threshold: number;
  confidence: number | null;
  verdict: string;
}

/* Rank real rows against the claim in front of the member.

   Pure and separate from the query, like eligiblePeers, so the relation rules
   are testable without a database. */
export function rankSimilar(
  rows: SimilarRow[],
  opts: {
    bucket: string | null;
    subject: string | null;
    stance: string;
    viewerId: string;
    excludeId?: string | null;
    limit?: number;
  }
): SimilarCall[] {
  if (!opts.subject) return [];
  const limit = opts.limit ?? 6;
  const out: SimilarCall[] = [];

  for (const row of rows) {
    if (opts.excludeId && row.id === opts.excludeId) continue;
    const call = normalizeCall(row.call);
    if (!call) continue;
    if (subjectKey(call) !== opts.subject) continue;

    const relation: SimilarRelation =
      opts.bucket && bucketKey(call) === opts.bucket
        ? "same-claim"
        : (call.stance ?? "up") === opts.stance
          ? "same-direction"
          : "same-subject";

    out.push({
      id: row.id,
      authorId: row.author_id,
      createdAt: row.created_at,
      relation,
      mine: row.author_id === opts.viewerId,
      token: call.token ?? null,
      stance: call.stance ?? "up",
      timeframe: call.timeframe ?? "24h",
      threshold: call.threshold ?? 0,
      confidence: typeof call.confidence === "number" ? call.confidence : null,
      verdict: call.verdict ?? "open",
    });
  }

  /* Closest relation first, then newest, so the list is deterministic and a
     re-run of the same read produces the same order. */
  out.sort((a, b) => {
    const rank = RELATION_RANK[b.relation] - RELATION_RANK[a.relation];
    if (rank !== 0) return rank;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  return out.slice(0, limit);
}

/* How far back a Call is still worth comparing against. Beyond this the
   subject has moved on and an old Call is history rather than a neighbour. */
const LOOKBACK_DAYS = 30;
const CANDIDATE_LIMIT = 400;

/* Similar Calls from real rows. Public Calls only: a Call written to a House or
   to followers is not the realm's to show a stranger, and this reader surfaces
   the row itself rather than an aggregate count. */
export async function similarCalls(
  db: SupabaseClient,
  opts: {
    call: CallData;
    viewerId: string;
    excludeId?: string | null;
    limit?: number;
  }
): Promise<SimilarCall[]> {
  const draft = normalizeCall(opts.call);
  if (!draft) return [];
  const subject = subjectKey(draft);
  if (!subject) return [];

  const from = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await db
    .from("posts")
    .select("id, author_id, body, call, created_at")
    .eq("kind", "call")
    .eq("deleted", false)
    .or("visibility.eq.public,visibility.is.null")
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  return rankSimilar((data ?? []) as unknown as SimilarRow[], {
    bucket: bucketKey(draft),
    subject,
    stance: draft.stance ?? "up",
    viewerId: opts.viewerId,
    excludeId: opts.excludeId ?? null,
    limit: opts.limit,
  });
}

export interface Discussion {
  /* Posts carrying this cashtag in the window, Calls included. */
  posts: number;
  /* The newest of them, so "lately" can be stated rather than implied. */
  latestAt: string | null;
  windowHours: number;
}

const DISCUSSION_WINDOW_HOURS = 48;

/* How much the realm has actually said about this subject lately.

   Cashtags are already extracted and stored uppercase on every post, so this is
   one indexed count and costs nothing. A subject nobody has mentioned returns
   zero, which is a real answer. */
export async function discussionFor(
  db: SupabaseClient,
  token: string | null | undefined
): Promise<Discussion | null> {
  const tag = token?.trim().replace(/^\$/, "").toUpperCase();
  if (!tag) return null;

  const from = new Date(
    Date.now() - DISCUSSION_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { count } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("deleted", false)
    .or("visibility.eq.public,visibility.is.null")
    .gte("created_at", from)
    .contains("cashtags", [tag]);

  const { data: latest } = await db
    .from("posts")
    .select("created_at")
    .eq("deleted", false)
    .or("visibility.eq.public,visibility.is.null")
    .gte("created_at", from)
    .contains("cashtags", [tag])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    posts: typeof count === "number" ? count : 0,
    latestAt: (latest as { created_at?: string } | null)?.created_at ?? null,
    windowHours: DISCUSSION_WINDOW_HOURS,
  };
}
