import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
  ogNumber,
} from "@/lib/share/og";
import { readHouseSubject } from "@/lib/share/subjects";

/* A House and where it stands, as a share card.
 *
 * The only card here that a group of people share at each other rather than
 * outward, which is exactly why it earns its place: a House arguing about its
 * own standing in a group chat is the realm's cheapest recruitment.
 *
 * Scored live off the ledger through the same top-twenty rule /api/houses uses.
 * A card that read houses.glory instead would publish a headcount contest as a
 * standing, and would disagree with the standings board it was screenshotted
 * beside.
 */

export const dynamic = "force-dynamic";

export const alt = "A House of The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const house = await readHouseSubject(slug);

  if (!house) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  /* Every number here is real or absent. Before a season has opened, a House
     honestly stands at zero rather than being hidden, which is the position
     /api/houses already takes: six Houses all reading zero is the true state of
     a realm that has not started scoring yet. */
  return new ImageResponse(
    (
      <OgCard
        kicker="A HOUSE"
        headline={house.name}
        subline={house.seasonName ? `${house.motto}  ·  ${house.seasonName}` : house.motto}
        stats={[
          {
            label: "STANDING",
            value: `${house.rank}/${house.houses}`,
            tone: house.rank === 1 ? "gold" : "bone",
          },
          { label: "GLORY", value: ogNumber(house.score) },
          { label: "SWORN", value: ogNumber(house.members), tone: "bone" },
          { label: "LEVEL", value: ogNumber(house.level), tone: "bone" },
        ]}
        glow="right"
      />
    ),
    { ...size }
  );
}
