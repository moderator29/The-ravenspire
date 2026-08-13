import { ImageResponse } from "next/og";
import { adminClient } from "@/lib/supabase/admin";
import {
  OgCard,
  OgGlyph,
  OG,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_GLYPH,
  OG_SIZE,
  OG_SANS,
  ogNumber,
  ogTrim,
} from "@/lib/share/og";

/* A single raven, as a share card.
 *
 * Moved onto the shared chassis in mission 10. The engagement band it draws
 * below the body is the one thing on any card in the realm that the chassis
 * does not cover, so it is passed in as the footer rather than pushed into
 * OgCard as a prop only one caller would ever use.
 *
 * C1, unchanged and still the important line in this file: a share card is read
 * by anyone holding the link, so only a public raven may unfurl. A restricted or
 * removed raven falls back to the realm's own card rather than leaking its words
 * into a preview.
 */

export const dynamic = "force-dynamic";

export const alt = "A raven on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

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
      post = row && !row.deleted && row.visibility === "public" ? row : null;
    }
  } catch {
    post = null;
  }

  if (!post) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  const author =
    post.author?.display_name ??
    (post.author?.handle ? `@${post.author.handle}` : "A member of the realm");
  const handle = post.author?.handle ? `@${post.author.handle}` : null;
  const body = ogTrim(post.body, 190);

  return new ImageResponse(
    (
      <OgCard
        kicker="A RAVEN"
        headline={ogTrim(author, 34) ?? "A member of the realm"}
        subline={handle}
        body={body}
        glow="left"
        footer={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: OG.boneMut,
              fontSize: 30,
              fontFamily: OG_SANS,
            }}
          >
            <OgGlyph path={OG_GLYPH.heart} color={OG.gold} />
            {ogNumber(post.like_count)}
            <OgGlyph path={OG_GLYPH.repost} lead={40} />
            {ogNumber(post.repost_count)}
            <OgGlyph path={OG_GLYPH.reply} lead={40} />
            {ogNumber(post.reply_count)}
          </div>
        }
      />
    ),
    { ...size }
  );
}
