import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import {
  conversationsOverCap,
  messagesOverCap,
} from "@/lib/raven/history";

/* Enforcing the Herald history caps against the database.
 *
 * The rules themselves are pure and live in lib/raven/history.ts with their
 * tests. This is the half that talks to Postgres, and it is a module rather
 * than a helper inside a route for two reasons: both routes need the
 * conversation cap, and a route.ts that exports anything other than HTTP
 * handlers and Next's own config keys fails the framework's route type check.
 *
 * Every query here is scoped by profile_id even when the ids being deleted
 * were read from that member's own rows a moment earlier. It costs nothing and
 * it means a mistake in the cap arithmetic can never reach another member's
 * conversations. */

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* Trim this member back to the conversation cap, least recently touched first.
 *
 * Run after a create and also after an append. An append creates nothing, but
 * it does change which conversation is oldest, and the cap is defined on last
 * activity rather than on creation. */
export async function enforceConversationCap(
  db: Db,
  profileId: string
): Promise<void> {
  const { data } = await db
    .from("raven_conversations")
    .select("id, updated_at")
    .eq("profile_id", profileId);

  const over = conversationsOverCap(
    (data ?? []) as { id: string; updated_at: string }[]
  );
  if (over.length === 0) return;

  /* Messages cascade with the conversation through the foreign key, so there
     is no window where a member's messages outlive their conversation. */
  await db
    .from("raven_conversations")
    .delete()
    .eq("profile_id", profileId)
    .in("id", over);
}

/* Trim one conversation back to the message cap, oldest first.
 *
 * A separate cap doing separate work: the conversation cap does nothing about
 * one thread growing without bound, and this table is member-writable. A
 * conversation is read from the bottom, so the oldest turns are the ones that
 * can go. */
export async function enforceMessageCap(
  db: Db,
  conversationId: string,
  profileId: string
): Promise<void> {
  const { data } = await db
    .from("raven_messages")
    .select("id, seq")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId);

  const over = messagesOverCap((data ?? []) as { id: string; seq: number }[]);
  if (over.length === 0) return;

  await db
    .from("raven_messages")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .in("id", over);
}
