import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A crest a member holds, as a share card.
 *
 * The rarest thing the realm produces and the one a member is most likely to
 * want other people to see, which is the whole justification for the Forge
 * register on a share artifact.
 *
 * A crest that is NOT held renders the realm's own card and never the crest.
 * That is the same refusal the page makes with a 404, and it matters more here:
 * a card is fetched by URL, so a route that rendered a crest for any handle
 * plus any slug would let anybody manufacture a convincing image of somebody
 * else holding something they never earned, and post it. The reader in
 * lib/share/subjects.ts requires the user_crests row before it returns
 * anything at all; the layout is lib/share/render.ts, shared with the share
 * sheet.
 */

export const dynamic = "force-dynamic";

export const alt = "A crest of The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const props = await renderShareCard({ kind: "crest", handle, slug });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
