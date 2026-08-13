import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
  ogNumber,
  ogTrim,
} from "@/lib/share/og";
import { readCrestSubject } from "@/lib/share/subjects";

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
 * anything at all.
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
  const crest = await readCrestSubject(handle, slug);

  if (!crest) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  return new ImageResponse(
    (
      <OgCard
        kicker="A CREST EARNED"
        headline={crest.crestName}
        subline={`${crest.holderName}  ·  @${crest.holderHandle}`}
        body={ogTrim(crest.earn, 130)}
        stats={[
          {
            label: "IN THE REALM",
            value:
              crest.holders === 1 ? "The only one" : ogNumber(crest.holders),
          },
          { label: "RARITY", value: crest.rarity.toUpperCase(), tone: "bone" },
        ]}
        glow="right"
      />
    ),
    { ...size }
  );
}
