import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flagReason, screen } from "@/lib/moderation/heuristics";

/* Running the free screen over something a member just wrote, and filing a flag
   for the moderators when it fires (V2 section 10).

   Three properties this deliberately has:

     It never blocks. The raven or the comment is already written and already
     visible by the time this runs. A heuristic cannot read intent, so it raises
     a flag for a person and nothing more.

     It never fails the request. This is called inside after(), like emit(), so
     a member never waits on it and a screening error can never lose their post.

     It never files twice. One open flag per subject, matching the dedupe the
     member facing report route already applies, so a moderator sees one row
     rather than a pile. */

/* How far back an identical body counts as a repeat. */
const REPEAT_WINDOW_HOURS = 24;

export type ScreenSubject = "post" | "comment";

export async function screenAndFlag(
  db: SupabaseClient,
  opts: {
    subjectType: ScreenSubject;
    subjectId: string;
    authorId: string;
    text: string;
    mentions?: number;
    cashtags?: number;
  }
): Promise<void> {
  try {
    const table = opts.subjectType === "post" ? "posts" : "comments";
    const since = new Date(
      Date.now() - REPEAT_WINDOW_HOURS * 3600 * 1000
    ).toISOString();

    /* How many times this exact text has been written by this member lately,
       counting the one that was just written. */
    const { count } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("author_id", opts.authorId)
      .eq("body", opts.text)
      .eq("deleted", false)
      .gte("created_at", since);

    const verdict = screen({
      text: opts.text,
      mentions: opts.mentions,
      cashtags: opts.cashtags,
      repeats: typeof count === "number" && count > 0 ? count : 1,
    });
    if (verdict.action !== "flag") return;

    const { data: existing } = await db
      .from("reports")
      .select("id")
      .eq("subject_type", opts.subjectType)
      .eq("subject_id", opts.subjectId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (existing) return;

    /* No reporter: the realm raised this one, not a member. The column is
       nullable precisely so a system flag is distinguishable from a person's. */
    await db.from("reports").insert({
      reporter_id: null,
      subject_type: opts.subjectType,
      subject_id: opts.subjectId,
      reason: flagReason(verdict),
    });
  } catch {
    /* Screening is never allowed to be the reason a member's words fail. */
  }
}
