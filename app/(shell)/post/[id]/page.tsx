import type { Metadata } from "next";
import { adminClient } from "@/lib/supabase/admin";
import { PostView } from "./post-view";

/* A raven, at its own address.
 *
 * The page is a thin server shell so the route can carry its own metadata. It
 * had none, so every raven ever shared unfurled as "The Ravenspire" with the
 * realm's own description under it: one title for every link the product
 * produces, on the channel the product is distributed through.
 *
 * WHAT IT IS ALLOWED TO SAY is exactly what the share card beside it is allowed
 * to say, and for the same reason: a title is read by anybody holding the link.
 * Only a public, undeleted raven names its author or quotes its words. Anything
 * else falls back to the realm's generic title rather than leaking a restricted
 * raven's first line into a preview, and a raven that cannot be read at all is
 * generic too. Nothing here is invented: an absent body yields no description.
 */

export const dynamic = "force-dynamic";

interface Row {
  body: string | null;
  deleted: boolean | null;
  visibility: string | null;
  author: { display_name: string | null; handle: string | null } | null;
}

/* Trim to a whole word, so a preview never ends mid-syllable. */
function trim(value: string | null, max: number): string | undefined {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

async function readRaven(id: string): Promise<Row | null> {
  const db = adminClient();
  if (!db) return null;
  try {
    const { data } = await db
      .from("posts")
      .select(
        "body, deleted, visibility, author:profiles!posts_author_id_fkey (display_name, handle)"
      )
      .eq("id", id)
      .maybeSingle();
    const row = (data as unknown as Row) ?? null;
    if (!row || row.deleted || row.visibility !== "public") return null;
    return row;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const raven = await readRaven(id);
  if (!raven) return { title: "A raven of the realm" };
  const author =
    raven.author?.display_name ??
    (raven.author?.handle ? `@${raven.author.handle}` : null);
  return {
    title: author ? `A raven from ${author}` : "A raven of the realm",
    description: trim(raven.body, 180),
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostView id={id} />;
}
