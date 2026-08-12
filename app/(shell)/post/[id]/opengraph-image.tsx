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
  deleted: boolean | null;
  visibility: string | null;
  like_count: number | null;
  reply_count: number | null;
  repost_count: number | null;
  author: {
    display_name: string | null;
    handle: string | null;
  } | null;
}

/* The realm's own glyphs, inlined.
 *
 * This band used to be three text characters standing in for icons, a heart, a
 * recycle arrow and a quotation mark, which is rule 2's "no emoji as icons"
 * written into the one surface most likely to be seen by someone who has never
 * opened the product. Satori cannot render the Icon component, since that
 * resolves CSS custom properties and a font Satori is not given, but it renders
 * inline SVG perfectly well, so the paths here are the same ones
 * components/ui/icon.tsx draws for heart, repost and reply.
 *
 * Copied rather than imported on purpose: Icon's paths are JSX built for the
 * browser runtime, and an OpenGraph image is generated in a different renderer
 * with no shared stroke or sizing context. Two lines of duplication beats
 * reaching across that boundary. */
function OgIcon({
  path,
  color = "#B9B4A8",
  lead = 0,
}: {
  path: string;
  color?: string;
  lead?: number;
}) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: lead, marginRight: 10 }}
    >
      <path d={path} />
    </svg>
  );
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
          "body, deleted, visibility, like_count, reply_count, repost_count, author:profiles!posts_author_id_fkey (display_name, handle)"
        )
        .eq("id", id)
        .maybeSingle();
      const row = (data as unknown as PostRow) ?? null;
      /* C1: a share card is read by anyone holding the link, so only a public
         raven may unfurl. A restricted or removed raven falls back to the
         house card rather than leaking its words into a preview. */
      post = row && !row.deleted && row.visibility === "public" ? row : null;
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
            "radial-gradient(circle at 20% 0%, rgba(217, 176, 64,0.16), rgba(7,7,10,0) 55%)",
          padding: 72,
        }}
      >
        {/* Author */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#D9B040",
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
                border: "4px solid #D9B040",
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
          <OgIcon path="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" color="#D9B040" />
          {likes}
          <OgIcon
            path="M4 9l3-3m0 0l3 3M7 6v9a3 3 0 0 0 3 3h2m8-3l-3 3m0 0l-3-3m3 3V9a3 3 0 0 0-3-3h-2"
            lead={40}
          />
          {reposts}
          <OgIcon
            path="M9 17l-5-5 5-5m-5 5h9a6 6 0 0 1 6 6v2"
            lead={40}
          />
          {replies}
        </div>
      </div>
    ),
    { ...size }
  );
}
