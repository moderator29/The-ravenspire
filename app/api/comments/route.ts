import { after } from "next/server";
import { requireProfile, getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { maybeRavenReplyToComment } from "@/lib/ai/mention";
import { createNotification, notifyMentions } from "@/lib/notifications";

const COMMENT_SELECT =
  "id, post_id, parent_id, body, like_count, created_at, author_id, author:profiles!comments_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";

/* GET /api/comments?post_id=... -> the full thread for a raven, enriched with
   author ids (needed to tip a commenter and to link their profile) and, when a
   member is signed in, which comments they have liked and bookmarked so the
   thread can render each action in its active state. Public: works signed-out
   too, minus the viewer-specific flags. */
export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const postId = new URL(req.url).searchParams.get("post_id");
  if (!postId) return json({ error: "bad request" }, 400);

  const { data: rows } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(300);

  const comments = (rows ?? []) as unknown as {
    id: string;
    author_id: string;
  }[];

  /* Fold in the reader's own likes and bookmarks when we know who they are. */
  const viewer = await getProfile(req);
  let liked = new Set<string>();
  let bookmarked = new Set<string>();
  if (viewer && comments.length) {
    const ids = comments.map((c) => c.id);
    const [reactions, marks] = await Promise.all([
      db
        .from("reactions")
        .select("subject_id")
        .eq("profile_id", viewer.id)
        .eq("subject_type", "comment")
        .in("subject_id", ids),
      db
        .from("comment_bookmarks")
        .select("comment_id")
        .eq("profile_id", viewer.id)
        .in("comment_id", ids),
    ]);
    liked = new Set((reactions.data ?? []).map((r) => r.subject_id as string));
    bookmarked = new Set(
      (marks.data ?? []).map((m) => m.comment_id as string)
    );
  }

  const enriched = (rows ?? []).map((c) => ({
    ...(c as Record<string, unknown>),
    liked: liked.has((c as { id: string }).id),
    bookmarked: bookmarked.has((c as { id: string }).id),
  }));

  return json({ comments: enriched });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    post_id?: string;
    parent_id?: string;
    body?: string;
  } | null;
  const text = body?.body?.trim();
  if (!body?.post_id || !text) return json({ error: "bad request" }, 400);
  if (text.length > 600) return json({ error: "Too long" }, 400);

  const { data: post } = await db
    .from("posts")
    .select("id, author_id, reply_count")
    .eq("id", body.post_id)
    .single();
  if (!post) return json({ error: "That raven is gone" }, 404);

  /* If this is a reply, learn who wrote the parent: a reply to one of the
     Raven's own comments should pull the Herald back into the thread even
     when @raven is not typed out. */
  let parentAuthorIsRaven = false;
  let parentAuthorId: string | null = null;
  if (body.parent_id) {
    const { data: parent } = await db
      .from("comments")
      .select("author_id, author:profiles!comments_author_id_fkey (handle, is_agent)")
      .eq("id", body.parent_id)
      .maybeSingle();
    parentAuthorId = (parent?.author_id as string | null) ?? null;
    const author = parent?.author as
      | { handle: string | null; is_agent: boolean | null }
      | { handle: string | null; is_agent: boolean | null }[]
      | null
      | undefined;
    const a = Array.isArray(author) ? author[0] : author;
    parentAuthorIsRaven = Boolean(a?.is_agent && a?.handle === "raven");
  }

  const { data: comment, error } = await db
    .from("comments")
    .insert({
      post_id: post.id,
      author_id: profile.id,
      parent_id: body.parent_id ?? null,
      body: text,
    })
    .select("id")
    .single();
  if (error || !comment) return json({ error: "Could not reply" }, 500);

  await db
    .from("posts")
    .update({ reply_count: post.reply_count + 1 })
    .eq("id", post.id);

  /* Ring the people this reply concerns, each at most once: the raven's author,
     the parent comment's author (when replying inside a thread), and anyone
     @mentioned in the body. createNotification skips self-notifications, and we
     track who has been notified so a mention never doubles a reply raven. */
  const notified = new Set<string>();
  await createNotification(db, {
    profile_id: post.author_id,
    kind: "reply",
    actor_id: profile.id,
    ref: post.id,
    body: text.slice(0, 120),
  });
  notified.add(post.author_id);
  if (parentAuthorId && !notified.has(parentAuthorId)) {
    await createNotification(db, {
      profile_id: parentAuthorId,
      kind: "reply",
      actor_id: profile.id,
      ref: post.id,
      body: text.slice(0, 120),
    });
    notified.add(parentAuthorId);
  }
  await notifyMentions(db, {
    text,
    actorId: profile.id,
    ref: post.id,
    body: text.slice(0, 120),
    excludeIds: notified,
  });

  await award(db, profile.id, {
    points: 2,
    glory: 1,
    reason: "replied",
    ref: comment.id,
  });

  after(async () => {
    await maybeRavenReplyToComment(db, {
      postId: post.id,
      commentId: comment.id,
      text,
      authorHandle: profile.handle,
      authorId: profile.id,
      parentAuthorIsRaven,
    });
  });

  return json({ ok: true, id: comment.id });
}
