import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Flag a post, comment, or member for the moderators.
   Body: { subject_type, subject_id, reason } */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    subject_type?: string;
    subject_id?: string;
    reason?: string;
  } | null;

  const subject_type = body?.subject_type;
  const subject_id = body?.subject_id;
  if (!subject_type || !subject_id) return json({ error: "bad request" }, 400);
  const reason = (body?.reason?.trim() || "unspecified").slice(0, 500);

  /* One open report per member per subject: re-flagging the same thing does
     not stack the queue. */
  const { data: existing } = await db
    .from("reports")
    .select("id")
    .eq("reporter_id", profile.id)
    .eq("subject_type", subject_type)
    .eq("subject_id", subject_id)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return json({ ok: true, deduped: true });

  await db.from("reports").insert({
    reporter_id: profile.id,
    subject_type,
    subject_id,
    reason,
    status: "open",
  });

  return json({ ok: true });
}
