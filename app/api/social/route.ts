import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { createNotification } from "@/lib/notifications";

/* One endpoint for the small social verbs: like, bookmark, follow, repost.
   Body: { action, subject_type?, subject_id?, on?, quote? } */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    subject_type?: "post" | "comment";
    subject_id?: string;
    on?: boolean;
    quote?: string;
  } | null;
  if (!body?.action) return json({ error: "bad request" }, 400);

  if (body.action === "like") {
    const { subject_type, subject_id, on } = body;
    if (!subject_type || !subject_id) return json({ error: "bad request" }, 400);
    const table = subject_type === "post" ? "posts" : "comments";
    if (on) {
      const { error } = await db.from("reactions").insert({
        profile_id: profile.id,
        subject_type,
        subject_id,
      });
      if (!error) {
        const { data: row } = await db
          .from(table)
          .select("like_count, author_id")
          .eq("id", subject_id)
          .single();
        if (row) {
          await db
            .from(table)
            .update({ like_count: row.like_count + 1 })
            .eq("id", subject_id);
          if (row.author_id !== profile.id) {
            /* First like from this member only: no unlike-relike minting. */
            const { data: prior } = await db
              .from("points_ledger")
              .select("id")
              .eq("profile_id", row.author_id)
              .eq("reason", `liked_by_${profile.id}`)
              .eq("ref", subject_id)
              .maybeSingle();
            if (!prior) {
              await db.from("notifications").insert({
                profile_id: row.author_id,
                kind: "like",
                actor_id: profile.id,
                subject_id,
              });
              await award(db, row.author_id, {
                points: 1,
                reason: `liked_by_${profile.id}`,
                ref: subject_id,
              });
            }
          }
        }
      }
    } else {
      const { error, count } = await db
        .from("reactions")
        .delete({ count: "exact" })
        .eq("profile_id", profile.id)
        .eq("subject_type", subject_type)
        .eq("subject_id", subject_id);
      if (!error && count) {
        const { data: row } = await db
          .from(table)
          .select("like_count")
          .eq("id", subject_id)
          .single();
        if (row)
          await db
            .from(table)
            .update({ like_count: Math.max(0, row.like_count - 1) })
            .eq("id", subject_id);
      }
    }
    return json({ ok: true });
  }

  if (body.action === "bookmark") {
    if (!body.subject_id) return json({ error: "bad request" }, 400);
    /* Bookmarks live in two shelves: posts and comments. Default to posts so
       older clients that omit subject_type keep working unchanged. */
    const onComment = body.subject_type === "comment";
    const table = onComment ? "comment_bookmarks" : "bookmarks";
    const col = onComment ? "comment_id" : "post_id";
    if (body.on) {
      await db
        .from(table)
        .upsert({ profile_id: profile.id, [col]: body.subject_id });
    } else {
      await db
        .from(table)
        .delete()
        .eq("profile_id", profile.id)
        .eq(col, body.subject_id);
    }
    return json({ ok: true });
  }

  if (body.action === "follow") {
    if (!body.subject_id) return json({ error: "bad request" }, 400);
    if (body.subject_id === profile.id)
      return json({ error: "You cannot follow yourself, however great" }, 400);
    if (body.on) {
      const { error } = await db.from("follows").insert({
        follower_id: profile.id,
        followee_id: body.subject_id,
      });
      if (!error) {
        /* A new banner-follower rings the followed member's ravens. */
        await createNotification(db, {
          profile_id: body.subject_id,
          kind: "follow",
          actor_id: profile.id,
        });
      }
    } else {
      await db
        .from("follows")
        .delete()
        .eq("follower_id", profile.id)
        .eq("followee_id", body.subject_id);
    }
    return json({ ok: true });
  }

  if (body.action === "repost") {
    if (!body.subject_id) return json({ error: "bad request" }, 400);
    /* Idempotent toggle. Older clients omit `on` and mean "repost"; the
       (profile_id, post_id) primary key makes a second repost a no-op, so the
       count never double-counts however many times the button is tapped. An
       explicit on:false un-reposts and decrements once. */
    const on = body.on !== false;
    if (on) {
      const { error } = await db.from("reposts").insert({
        profile_id: profile.id,
        post_id: body.subject_id,
        quote: body.quote?.slice(0, 280) ?? null,
      });
      /* error here is the duplicate-key conflict on a re-tap: already reposted,
         so we neither increment nor notify again. */
      if (!error) {
        const { data: row } = await db
          .from("posts")
          .select("repost_count, author_id")
          .eq("id", body.subject_id)
          .single();
        if (row) {
          await db
            .from("posts")
            .update({ repost_count: row.repost_count + 1 })
            .eq("id", body.subject_id);
          if (row.author_id !== profile.id)
            await db.from("notifications").insert({
              profile_id: row.author_id,
              kind: "reraven",
              actor_id: profile.id,
              subject_id: body.subject_id,
            });
        }
      }
    } else {
      const { error, count } = await db
        .from("reposts")
        .delete({ count: "exact" })
        .eq("profile_id", profile.id)
        .eq("post_id", body.subject_id);
      if (!error && count) {
        const { data: row } = await db
          .from("posts")
          .select("repost_count")
          .eq("id", body.subject_id)
          .single();
        if (row)
          await db
            .from("posts")
            .update({ repost_count: Math.max(0, row.repost_count - 1) })
            .eq("id", body.subject_id);
      }
    }
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
