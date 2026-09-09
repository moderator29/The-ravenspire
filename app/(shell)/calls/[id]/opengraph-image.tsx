import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A Call, as a share card. The one the realm most wants shared.
 *
 * A resolved Call is the only thing this product makes that a stranger can
 * judge without joining: a member said a thing in public, before the fact, with
 * a number attached, and the realm scored it. That is the whole argument for
 * Renown compressed into one image, and it is why this route exists.
 *
 * THE VERDICT IS NEVER DRESSED UP. A miss shows MISS, in ember, at the same
 * weight a hit shows HIT. A share card that only unfurls flatteringly is a
 * highlight reel, and a highlight reel is worth nothing as evidence, which
 * makes it worth nothing as distribution either. The score is the settlement's
 * own number and is absent while a Call is still open, because there is no
 * score yet and inventing a provisional one would be inventing data.
 *
 * The layout itself lives in lib/share/render.ts now, shared with the in-app
 * share sheet's live preview and download.
 */

export const dynamic = "force-dynamic";

export const alt = "A Call on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const props = await renderShareCard({ kind: "call", id });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
