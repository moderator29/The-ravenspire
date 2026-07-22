import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askRaven, ravenEnabled } from "@/lib/ai/raven";
import { lookupToken, describeTokenForRaven } from "@/lib/data/tokens";
import { detectHouses, describeHousesForRaven } from "@/lib/ai/raven-voice";

/* The Herald answers inline when a member calls on it: a raven or comment that
   tags @raven, or a reply to one of the Raven's own comments. It always speaks
   as its own account and threads its answer beneath the member it is answering,
   so a conversation reads as a real back-and-forth. Real market data for any
   $cashtags is attached as verified context. */

const RAVEN_HANDLE = "raven";

/* A thread cannot become an endless Raven monologue: once the Herald has
   spoken this many times under a single raven, it falls silent there. */
const MAX_RAVEN_PER_POST = 8;

async function ravenProfileId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("handle", RAVEN_HANDLE)
    .eq("is_agent", true)
    .single();
  return data?.id ?? null;
}

/* True while the Raven still has room to answer in this raven's thread. */
async function ravenUnderQuota(
  db: SupabaseClient,
  postId: string,
  ravenId: string
): Promise<boolean> {
  const { count } = await db
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("author_id", ravenId);
  return (count ?? 0) < MAX_RAVEN_PER_POST;
}

/* Gather real, verified context lines for any $cashtags (and Houses) named. */
async function buildContext(text: string): Promise<string | undefined> {
  const cashtags = [...text.matchAll(/\$([a-zA-Z0-9]{2,12})/g)].map((m) => m[1]);
  const contexts: string[] = [];
  for (const tag of cashtags.slice(0, 3)) {
    const card = await lookupToken(tag);
    if (card) contexts.push(describeTokenForRaven(card));
    else contexts.push(`Token $${tag.toUpperCase()}: no live data found.`);
  }
  const matchedHouses = detectHouses(text);
  if (matchedHouses.length) contexts.push(describeHousesForRaven(matchedHouses));
  return contexts.length ? contexts.join("\n") : undefined;
}

/* Compose and file the Raven's reply beneath `parentId` (null = thread root),
   then bump the raven's reply count and notify the member being answered. */
async function fileRavenReply(
  db: SupabaseClient,
  opts: {
    ravenId: string;
    postId: string;
    parentId: string | null;
    prompt: string;
    text: string;
    notifyProfileId: string | null;
  }
): Promise<void> {
  const result = await askRaven(
    [{ role: "user", content: opts.prompt }],
    await buildContext(opts.text)
  );
  if (!result) return;

  const { data: comment } = await db
    .from("comments")
    .insert({
      post_id: opts.postId,
      author_id: opts.ravenId,
      parent_id: opts.parentId,
      body: result.text,
    })
    .select("id")
    .single();

  const { data: post } = await db
    .from("posts")
    .select("reply_count")
    .eq("id", opts.postId)
    .single();
  if (post) {
    await db
      .from("posts")
      .update({ reply_count: post.reply_count + 1 })
      .eq("id", opts.postId);
  }

  /* Tell the member the Raven answered them, not the raven's original author. */
  if (opts.notifyProfileId && opts.notifyProfileId !== opts.ravenId) {
    await db.from("notifications").insert({
      profile_id: opts.notifyProfileId,
      kind: "raven_reply",
      actor_id: opts.ravenId,
      subject_id: comment?.id ?? opts.postId,
      body: "The Raven has answered.",
    });
  }
}

/* A new raven that tags @raven earns a reply at the top of its own thread. */
export async function maybeRavenReplyToPost(
  db: SupabaseClient,
  postId: string,
  text: string,
  authorHandle: string | null,
  authorId: string | null = null
): Promise<void> {
  if (!ravenEnabled()) return;
  if (!/@raven\b/i.test(text)) return;
  const ravenId = await ravenProfileId(db);
  if (!ravenId) return;
  if (!(await ravenUnderQuota(db, postId, ravenId))) return;

  await fileRavenReply(db, {
    ravenId,
    postId,
    parentId: null,
    notifyProfileId: authorId,
    text,
    prompt: `A member of the realm${authorHandle ? ` (@${authorHandle})` : ""} tagged you in the Ravenry and said:\n\n"${text}"\n\nReply inline as @raven. Keep it under 120 words.`,
  });
}

/* A comment earns a threaded Raven reply when it tags @raven, or when it is a
   direct reply to one of the Raven's own comments. The answer is filed beneath
   the member's comment so the exchange stays in that thread. */
export async function maybeRavenReplyToComment(
  db: SupabaseClient,
  opts: {
    postId: string;
    commentId: string;
    text: string;
    authorHandle: string | null;
    authorId: string | null;
    parentAuthorIsRaven: boolean;
  }
): Promise<void> {
  if (!ravenEnabled()) return;
  const tagged = /@raven\b/i.test(opts.text);
  if (!tagged && !opts.parentAuthorIsRaven) return;
  const ravenId = await ravenProfileId(db);
  if (!ravenId) return;
  /* A member cannot be the Raven; guards against the agent answering itself. */
  if (opts.authorId && opts.authorId === ravenId) return;
  if (!(await ravenUnderQuota(db, opts.postId, ravenId))) return;

  const lead =
    tagged || !opts.parentAuthorIsRaven
      ? `A member of the realm${opts.authorHandle ? ` (@${opts.authorHandle})` : ""} tagged you in a thread and said:`
      : `A member of the realm${opts.authorHandle ? ` (@${opts.authorHandle})` : ""} replied to your last message in a thread and said:`;

  await fileRavenReply(db, {
    ravenId,
    postId: opts.postId,
    parentId: opts.commentId,
    notifyProfileId: opts.authorId,
    text: opts.text,
    prompt: `${lead}\n\n"${opts.text}"\n\nContinue the conversation inline as @raven, staying on the thread's topic. Keep it under 120 words.`,
  });
}
