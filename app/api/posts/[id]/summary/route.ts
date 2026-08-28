import { MODEL_REASONING, heraldAvailable, heraldProse } from "@/lib/ai/herald";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { canViewPost, resolveViewer } from "@/lib/social/feed-server";

/* The Herald reads a discussion (V2 section 10, the row reading "Summarise a
   discussion: per thread, on demand only. Build, never automatic").

   "Never automatic" is the load bearing half of that verdict and it is enforced
   here rather than trusted: this route is a POST a member makes, there is no
   producer that calls it, and nothing on a page fires it on render. A summary
   that generated itself on every thread view would spend the realm's day on
   people scrolling past.

   The thread's own audience is enforced before anything is read. This route
   holds the service role key, so a raven written to followers has to be checked
   against the reader here, exactly as GET /api/comments does. Not admitted is a
   404, never a hint that the raven exists.

   A short thread is refused rather than summarised. Four comments are quicker
   to read than a paragraph about four comments, and paying a model to shorten
   something already short is the expensive kind of pointless.

   Two spend caps, both through the shared Supabase limiter so they hold across
   instances. No key configured is an honest 503 and the surface degrades on it,
   because a canned summary of a conversation a member can read for themselves
   is the easiest kind of fake to catch and the worst kind to ship. */

export const dynamic = "force-dynamic";

/* A thread shorter than this is not worth a paid summary. */
const MIN_COMMENTS = 5;
/* How many comments the Herald is shown. A thread longer than this is summarised
   from its first two hundred, and the prompt says so rather than implying the
   whole thread was read. */
const MAX_COMMENTS = 200;
/* Each comment is capped so one enormous comment cannot dominate the prompt. */
const COMMENT_CHARS = 600;

const PER_MEMBER_HOURLY = 8;
const REALM_DAILY = 300;

const SYSTEM = `You are @raven, the Herald of The Ravenspire, summarising a discussion for a member who has not read it.

Rules, all absolute:
- Summarise ONLY what is in the messages you are given. Never add a fact, a name, or a number that is not in them.
- Report what people actually said, including disagreement. If the thread is split, say it is split and say on what. Never smooth a disagreement into a consensus that nobody reached.
- Never take a side, never judge who is right, and never give financial advice.
- Never predict anything and never tell anyone to act.
- Attribute by handle only when the point matters and the handle is given to you.
- No em dashes, ever. Use a comma, a period, or restructure.
- No emoji, no hashtags, no headings, no lists, no preamble. Three or four sentences of plain prose, under 110 words.`;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  if (!heraldAvailable()) {
    return json(
      {
        error:
          "The Herald is not in the rookery. This realm has no Anthropic key configured, so there is no summary to give.",
      },
      503
    );
  }

  const { id } = await ctx.params;
  if (!id) return json({ error: "bad request" }, 400);

  /* The thread inherits the raven's audience, and this is decided before a
     single comment is read. */
  const viewer = await resolveViewer(db, profile);
  if (!(await canViewPost(db, viewer, id))) {
    return json({ error: "not found" }, 404);
  }

  const mine = await rateLimit(
    profileKey("thread-summary", profile.id),
    PER_MEMBER_HOURLY,
    3600
  );
  if (!mine.ok) {
    return json(
      {
        error: "The Herald has read enough threads for you this hour.",
        retryAfter: mine.retryAfter,
      },
      429
    );
  }

  /* B5: fails closed, like every other realm-wide ceiling over a paid
     Anthropic call. This is the only limit standing between a limiter outage
     and an unbounded bill, and a limiter that waves everything through when
     the store is unreachable is not that limit. The per-member ceiling above
     stays fail-open: it protects the realm's budget only through this one. */
  const realm = await rateLimit("thread-summary:realm", REALM_DAILY, 86400, {
    failClosed: true,
  });
  if (!realm.ok) {
    return json(
      {
        error: "The Herald has spent the realm's voice for today.",
        retryAfter: realm.retryAfter,
      },
      429
    );
  }

  const { data: post } = await db
    .from("posts")
    .select("id, body, created_at, reply_count")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (!post) return json({ error: "not found" }, 404);

  const { data: rows } = await db
    .from("comments")
    .select(
      "id, body, created_at, author:profiles!comments_author_id_fkey (handle, display_name)"
    )
    .eq("post_id", id)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(MAX_COMMENTS);

  const comments = (rows ?? []) as unknown as {
    id: string;
    body: string;
    created_at: string;
    author: { handle: string | null; display_name: string | null } | null;
  }[];

  if (comments.length < MIN_COMMENTS) {
    return json(
      {
        error: `There are only ${comments.length} replies here. Read them, they are shorter than a summary of them.`,
      },
      400
    );
  }

  const head = (post as { body?: string | null }).body ?? "";
  const lines = comments.map((c) => {
    const who = c.author?.handle ? `@${c.author.handle}` : "a member";
    return `${who}: ${c.body.replace(/\s+/g, " ").trim().slice(0, COMMENT_CHARS)}`;
  });

  const truncated = comments.length >= MAX_COMMENTS;

  const text = await heraldProse({
    model: MODEL_REASONING,
    system: SYSTEM,
    user: `Summarise this discussion. The raven it hangs from said:\n\n"${head.replace(/\s+/g, " ").trim().slice(0, 1000)}"\n\n${truncated ? `These are the first ${MAX_COMMENTS} replies, and there are more.` : `These are all ${comments.length} replies.`}\n\n${lines.join("\n")}`,
    maxTokens: 450,
    effort: "low",
  });
  if (!text) return json({ error: "The Herald had nothing to say." }, 502);
  return json({ ok: true, text, comments: comments.length, truncated });
}
