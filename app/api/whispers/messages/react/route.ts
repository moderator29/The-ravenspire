import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { isReaction } from "@/lib/reactions";
import { assertMember, blockedBetween, broadcast } from "@/lib/whispers/guard";

/* React to a whisper, reusing the Rookery's own reaction pattern: the same
   six glyph palette (lib/reactions.ts), a realtime broadcast on the
   conversation's own channel so the open thread updates the instant it
   happens, and a toggle rather than a running tally.
 *
 * At most one reaction per member per message, because a whisper is read by
 * exactly two people (see lib/whispers/guard.ts): there is no crowd here to
 * count a reaction across, only "how do you two feel about this one line".
 * Sending the reaction already standing removes it; sending a different one
 * replaces it. */

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    message?: string;
    reaction?: string;
  } | null;
  if (!body?.message || !isReaction(body.reaction))
    return json({ error: "bad request" }, 400);

  const { data: message } = await db
    .from("messages")
    .select("id, conversation_id")
    .eq("id", body.message)
    .maybeSingle();
  if (!message) return json({ error: "No such whisper" }, 404);

  const conversationId = message.conversation_id as string;
  if (!(await assertMember(db, conversationId, profile.id)))
    return json({ error: "Not your whisper" }, 403);
  if (await blockedBetween(db, conversationId, profile.id))
    return json({ error: "That door is closed." }, 403);

  const { data: existing } = await db
    .from("message_reactions")
    .select("reaction")
    .eq("message_id", body.message)
    .eq("profile_id", profile.id)
    .maybeSingle();

  const reaction = body.reaction;
  const removed = existing?.reaction === reaction;

  if (removed) {
    await db
      .from("message_reactions")
      .delete()
      .eq("message_id", body.message)
      .eq("profile_id", profile.id);
  } else {
    await db.from("message_reactions").upsert(
      { message_id: body.message, profile_id: profile.id, reaction },
      { onConflict: "message_id,profile_id" }
    );
  }

  await broadcast(`whispers:conv:${conversationId}`, "reaction", {
    message_id: body.message,
    profile_id: profile.id,
    reaction: removed ? null : reaction,
  });

  return json({ ok: true, reaction: removed ? null : reaction });
}
