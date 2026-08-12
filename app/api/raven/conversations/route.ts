import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  MAX_CONVERSATIONS,
  deriveTitle,
  normalizeTitle,
  nextSeqs,
  validateMessages,
} from "@/lib/raven/history";
import { enforceConversationCap } from "@/lib/raven/store";

/* A member's Herald conversations.
 *
 * The Herald's history lived entirely in localStorage, which meant a member
 * lost every conversation by clearing their browser and got nothing at all on
 * a second device. This is the server half.
 *
 *   GET     list this member's conversations, most recently touched first
 *   POST    create one, optionally with its opening messages
 *   DELETE  delete all of them
 *
 * Ownership is the whole security model here, because RLS cannot help: this
 * stack authenticates with Privy, so auth.uid() is null and the tables deny
 * every browser role outright. Every query below is therefore scoped by
 * profile_id from a verified token, and never by an id the caller supplied.
 *
 * The caps are enforced here rather than trusted from the client, on the same
 * principle as server-settled rewards: the client already trims to 40 and that
 * is a convenience, not a guarantee. */

export const dynamic = "force-dynamic";

/* What the drawer needs to draw a row. Deliberately not the messages: a list
   of 40 conversations with their full transcripts is a large response for a
   panel that shows a title and a timestamp. */
const LIST_SELECT = "id, title, created_at, updated_at";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* The promise this route makes: most recently touched first, and a total
     order. Two conversations updated in the same millisecond would otherwise
     come back in whatever order the planner chose, which makes the drawer
     reshuffle between reads for no reason a member can see. */
  const { data, error } = await db
    .from("raven_conversations")
    .select(LIST_SELECT)
    .eq("profile_id", profile.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_CONVERSATIONS);

  if (error) return json({ error: "query_failed" }, 500);
  return json({ conversations: data ?? [] });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    messages?: unknown;
  } | null;

  /* Opening messages are optional: the drawer's "new chat" creates an empty
     conversation, and a first send creates one already carrying its turn. */
  let messages: ReturnType<typeof validateMessages> | null = null;
  if (body?.messages !== undefined) {
    messages = validateMessages(body.messages);
    if (!messages.ok) return json({ error: messages.error }, 400);
  }

  const title =
    typeof body?.title === "string" && body.title.trim() !== ""
      ? normalizeTitle(body.title)
      : messages?.ok
        ? deriveTitle(messages.value)
        : undefined;

  const { data: created, error } = await db
    .from("raven_conversations")
    .insert({
      profile_id: profile.id,
      ...(title ? { title } : {}),
    })
    .select(LIST_SELECT)
    .single();

  if (error || !created) return json({ error: "create_failed" }, 500);

  if (messages?.ok) {
    const seqs = nextSeqs(null, messages.value.length);
    const { error: mErr } = await db.from("raven_messages").insert(
      messages.value.map((m, i) => ({
        conversation_id: (created as { id: string }).id,
        profile_id: profile.id,
        role: m.role,
        content: m.content,
        meta: m.meta ?? {},
        seq: seqs[i],
      }))
    );
    /* The conversation exists and the messages did not land. Removing the
       conversation is the honest outcome: a member seeing an empty thread they
       just spoke into is worse than seeing the send fail. */
    if (mErr) {
      await db
        .from("raven_conversations")
        .delete()
        .eq("id", (created as { id: string }).id)
        .eq("profile_id", profile.id);
      return json({ error: "create_failed" }, 500);
    }
  }

  await enforceConversationCap(db, profile.id);

  return json({ conversation: created }, 201);
}

export async function DELETE(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Messages go with the conversation through the foreign key's cascade, so
     this is one delete rather than two, and there is no window in which a
     member's messages outlive the conversation that owned them. */
  const { error } = await db
    .from("raven_conversations")
    .delete()
    .eq("profile_id", profile.id);

  if (error) return json({ error: "delete_failed" }, 500);
  return json({ ok: true });
}
