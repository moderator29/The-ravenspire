import { ImageResponse } from "next/og";
import { adminClient } from "@/lib/supabase/admin";

/* A dynamic share card for a single raven (post): the author, their words and
   the engagement, in the realm's obsidian-and-gold livery. Rendered on demand
   so every shared link looks premium on X and Telegram. Real data only; falls
   back to the house card when the raven cannot be read. */

export const alt = "A raven on The Ravenspire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface PostRow {
  body: string | null;
  like_count: number | null;
  reply_count: number | null;
  repost_count: number | null;
  author: {
    display_name: string | null;
    handle: string | null;
  } | null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let post: PostRow | null = null;
  try {
    const db = adminClient();
    if (db) {
      const { data } = await db
        .from("posts")
        .select(
          "body, like_count, reply_count, repost_count, author:profiles!posts_author_id_fkey (display_name, handle)"
        )
        .eq("id", id)
        .maybeSingle();
      post = (data as unknown as PostRow) ?? null;
    }
  } catch {
    post = null;
  }

  const author =
    post?.author?.display_name ??
    (post?.author?.handle ? `@${post.author.handle}` : "A member of the realm");
  const handle = post?.author?.handle ? `@${post.author.handle}` : "";
  const body = (post?.body ?? "A raven flies over The Ravenspire.").slice(0, 200);
  const likes = post?.like_count ?? 0;
  const replies = post?.reply_count ?? 0;
  const reposts = post?.repost_count ?? 0;

  const serif = "ui-serif, Georgia, 'Times New Roman', Times, serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#07070A",
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(200,162,76,0.16), rgba(7,7,10,0) 55%)",
          padding: 72,
        }}
      >
        {/* Author */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#C8A24C",
              fontSize: 26,
              letterSpacing: 8,
              fontFamily: serif,
              fontWeight: 700,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
                borderRadius: 14,
                border: "4px solid #C8A24C",
                marginRight: 20,
                fontSize: 36,
              }}
            >
              R
            </div>
            THE RAVENSPIRE
          </div>
          <div
            style={{
              marginTop: 40,
              color: "#F2EFE6",
              fontSize: 34,
              fontWeight: 600,
            }}
          >
            {author}{" "}
            {handle && (
              <span style={{ color: "#8C877B", fontSize: 26 }}>{handle}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            display: "flex",
            color: "#EDEAE1",
            fontSize: 52,
            lineHeight: 1.25,
            fontFamily: serif,
          }}
        >
          {body}
        </div>

        {/* Engagement */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "#B9B4A8",
            fontSize: 30,
          }}
        >
          <span style={{ color: "#C8A24C", marginRight: 10 }}>♥</span>
          {likes}
          <span style={{ margin: "0 10px 0 40px" }}>↺</span>
          {reposts}
          <span style={{ margin: "0 10px 0 40px" }}>❝</span>
          {replies}
        </div>
      </div>
    ),
    { ...size }
  );
}
