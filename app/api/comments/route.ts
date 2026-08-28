import { after } from "next/server";
import { requireProfile, getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { maybeRavenReplyToComment } from "@/lib/ai/mention";
import { screenAndFlag } from "@/lib/moderation/screen";
import { createNotification, notifyMentions } from "@/lib/notifications";
import {
  ANON_VIEWER,
  canViewPost,
  resolveViewer,
} from "@/lib/social/feed-server";
import { profileKey, rateLimit } from "@/lib/rate-limit";

const COMMENT_SELECT =
  "id, post_id, parent_id, body, like_count, created_at, author_id, author:profiles!comments_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";

/* A reply that summons the Herald. Matched here as well as in lib/ai/mention.ts
   for the same reason /api/posts matches it: this route has to know, before it
   writes anything, whether the reply it is about to accept will spend Anthropic
   budget. */
const TAGS_RAVEN = /@raven\b/i;

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

  /* C1: a thread inherits its raven's audience. This route reads with the
     service role, so it has to make that decision itself; without it, the
     comments on a "Followers only" raven were readable by anyone who knew the
     raven's id. Not admitted reads as an empty thread, never as a hint that
     the raven exists. */
  const viewer = await getProfile(req);
  const feedViewer = viewer ? await resolveViewer(db, viewer) : ANON_VIEWER;
  if (!(await canViewPost(db, feedViewer, postId)))
    return json({ comments: [] });

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

  /* C4: replies are cheap for a script and expensive for the realm (each one
     writes a comment, a notification fan-out, a points award and can wake the
     Herald). Keyed on the account, not the IP. */
  const rl = await rateLimit(profileKey("comments", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      { error: "You have said plenty for one hour. Return shortly.", retryAfter: rl.retryAfter },
      429
    );

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
    .select("id, author_id")
    .eq("id", body.post_id)
    .single();
  if (!post) return json({ error: "That raven is gone" }, 404);

  /* C1: you cannot reply into a raven you were never admitted to. */
  const feedViewer = await resolveViewer(db, profile);
  if (!(await canViewPost(db, feedViewer, post.id)))
    return json({ error: "That raven is gone" }, 404);

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

  /* A2: the Herald's own ceiling, and it is the SAME allowance /api/posts
     spends. A comment wakes exactly the paid Anthropic call a post does, on
     exactly the two conditions maybeRavenReplyToComment acts on (the reply
     tags @raven, or it answers one of the Herald's own comments), and until
     now the only thing above it was the sixty-replies-an-hour limiter that
     also governs free replies. So a member refused at ten summons under
     /api/posts simply moved to the reply box and kept spending. One key,
     "posts:raven", so the two routes share one hourly allowance rather than
     handing a member ten of each. Checked before anything is written, so a
     member who has spent the hour can still reply: they simply cannot summon
     the Herald with it. */
  const summonsRaven = TAGS_RAVEN.test(text) || parentAuthorIsRaven;
  if (summonsRaven) {
    const heraldRl = await rateLimit(
      profileKey("posts:raven", profile.id),
      10,
      3600
    );
    if (!heraldRl.ok)
      return json(
        {
          error:
            "The Herald has answered you enough this hour. Reply without the summons, or return later.",
          retryAfter: heraldRl.retryAfter,
        },
        429
      );
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

  /* B6: atomic, so two replies landing together cannot lose a count. */
  await db.rpc("bump_post_counts", { p_post_id: post.id, p_replies: 1 });

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

  /* Replying is unlimited and reciprocal, so it draws on the daily social
     allowance (V2 section 9.5, rule 4). Two accounts commenting on each other
     forever used to mint unbounded Renown. */
  await award(db, profile.id, {
    points: 2,
    glory: 1,
    reason: "replied",
    ref: comment.id,
    category: "social",
  });

  after(async () => {
    /* The same free screen the Ravenry runs over a raven. It never blocks and
       never hides, it only raises a flag a moderator reads. */
    await screenAndFlag(db, {
      subjectType: "comment",
      subjectId: comment.id,
      authorId: profile.id,
      text,
    });
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
