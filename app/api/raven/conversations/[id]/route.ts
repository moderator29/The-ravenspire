import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  MAX_MESSAGES_PER_CONVERSATION,
  nextSeqs,
  normalizeTitle,
  validateMessages,
} from "@/lib/raven/history";
import { enforceConversationCap, enforceMessageCap } from "@/lib/raven/store";

/* One Herald conversation.
 *
 *   GET     read it, with its messages in order
 *   POST    append messages to it
 *   PATCH   rename it
 *   DELETE  delete it
 *
 * Every one of these takes an id from the caller, which makes ownership the
 * only thing standing between a member and somebody else's conversations with
 * the Herald. The rule, applied identically in all four: the id is never used
 * alone. It is always paired with profile_id from a verified token, so a
 * conversation belonging to another member simply is not found.
 *
 * Not found, not forbidden. A 403 on someone else's id confirms that the id
 * exists, which is a membership oracle over private conversations. A 404 says
 * the same thing to a member who mistyped and to an attacker enumerating. */

export const dynamic = "force-dynamic";

const CONVERSATION_SELECT = "id, title, created_at, updated_at";

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* The one ownership check, written once so the four handlers cannot each
   forget it differently. Returns null when this member does not own it, which
   every caller turns into a 404. */
async function ownedConversation(
  db: Db,
  id: string,
  profileId: string
): Promise<{ id: string; title: string } | null> {
  const { data } = await db
    .from("raven_conversations")
    .select("id, title")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  return (data as { id: string; title: string } | null) ?? null;
}

/* Postgres invalid-text-representation. A caller passing something that is not
   a uuid is a 404 like any other id that names nothing, not a 500. */
const INVALID_UUID = "22P02";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!isUuid(id)) return json({ error: "not_found" }, 404);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data: conversation } = await db
    .from("raven_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!conversation) return json({ error: "not_found" }, 404);

  /* Ordered by seq, which is what seq exists for: one send writes the member's
     message and the Herald's reply in the same millisecond, and ordering on
     created_at would leave the pair's order undefined. */
  const { data: messages, error } = await db
    .from("raven_messages")
    .select("id, role, content, meta, seq, created_at")
    .eq("conversation_id", id)
    .eq("profile_id", profile.id)
    .order("seq", { ascending: true })
    .limit(MAX_MESSAGES_PER_CONVERSATION);

  if (error) return json({ error: "query_failed" }, 500);
  return json({ conversation, messages: messages ?? [] });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!isUuid(id)) return json({ error: "not_found" }, 404);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const owned = await ownedConversation(db, id, profile.id);
  if (!owned) return json({ error: "not_found" }, 404);

  const body = (await req.json().catch(() => null)) as {
    messages?: unknown;
  } | null;
  const parsed = validateMessages(body?.messages);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  /* Where this append starts. Read rather than counted: a conversation that has
     been trimmed has fewer rows than its highest seq, and counting would reuse
     a position the unique index has already seen. */
  const { data: last } = await db
    .from("raven_messages")
    .select("seq")
    .eq("conversation_id", id)
    /* Ownership is already established above, so this is redundant today. It
       is here because the invariant is "every query names profile_id", and an
       invariant that holds only while the checks above it stay in this order
       is one refactor away from being a silent, total leak. */
    .eq("profile_id", profile.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const highest =
    last && typeof (last as { seq?: unknown }).seq === "number"
      ? (last as { seq: number }).seq
      : null;
  const seqs = nextSeqs(highest, parsed.value.length);

  const { data: inserted, error } = await db
    .from("raven_messages")
    .insert(
      parsed.value.map((m, i) => ({
        conversation_id: id,
        profile_id: profile.id,
        role: m.role,
        content: m.content,
        meta: m.meta ?? {},
        seq: seqs[i],
      }))
    )
    .select("id, role, content, meta, seq, created_at");

  if (error) {
    if (error.code === INVALID_UUID) return json({ error: "not_found" }, 404);
    return json({ error: "append_failed" }, 500);
  }

  /* Touching the conversation is what the drawer's ordering is built on, and
     it is also what moves this conversation out of the cap's firing line. */
  const { data: touched } = await db
    .from("raven_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profile.id)
    .select(CONVERSATION_SELECT)
    .maybeSingle();

  await enforceMessageCap(db, id, profile.id);
  /* The member did not create a conversation here, but they did change which
     one is oldest, so the conversation cap is re-evaluated too. */
  await enforceConversationCap(db, profile.id);

  return json({ conversation: touched, messages: inserted ?? [] }, 201);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!isUuid(id)) return json({ error: "not_found" }, 404);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
  if (typeof body?.title !== "string")
    return json({ error: "A conversation needs a name." }, 400);

  /* normalizeTitle collapses whitespace, trims to the column's length and
     falls back rather than storing a title made of spaces, so a rename can
     never leave a member with an unnamed row they cannot find. */
  const title = normalizeTitle(body.title);

  const { data, error } = await db
    .from("raven_conversations")
    .update({ title })
    .eq("id", id)
    .eq("profile_id", profile.id)
    .select(CONVERSATION_SELECT)
    .maybeSingle();

  if (error) return json({ error: "rename_failed" }, 500);
  if (!data) return json({ error: "not_found" }, 404);
  return json({ conversation: data });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!isUuid(id)) return json({ error: "not_found" }, 404);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Messages cascade with it. The delete is scoped by profile_id, so an id
     belonging to somebody else deletes nothing and reports not found. */
  const { data, error } = await db
    .from("raven_conversations")
    .delete()
    .eq("id", id)
    .eq("profile_id", profile.id)
    .select("id")
    .maybeSingle();

  if (error) return json({ error: "delete_failed" }, 500);
  if (!data) return json({ error: "not_found" }, 404);
  return json({ ok: true });
}
