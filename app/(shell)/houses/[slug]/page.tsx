import type { Metadata } from "next";
import { houseBySlug } from "@/lib/data/houses";
import { readHouseSubject } from "@/lib/share/subjects";
import { HouseHallView } from "./house-hall-view";

/* One House hall, at its own address.
 *
 * A thin server shell so the hall carries its own metadata. A House arguing
 * about its own standing in a group chat is the realm's cheapest recruitment,
 * and until this existed every link one of them pasted unfurled as the realm's
 * front door.
 *
 * The standing comes from lib/share/subjects.ts, scored the same way /api/houses
 * scores it. When the ledger cannot be read the name and the motto still can:
 * those are static realm data, not a number, so the title stays true and the
 * description simply says less rather than saying something invented.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = houseBySlug(slug);
  if (!meta) return { title: "The Houses" };

  const standing = await readHouseSubject(slug);
  return {
    title: meta.name,
    description: standing
      ? `${meta.motto}. Standing ${standing.rank} of ${standing.houses}, with ${standing.score.toLocaleString("en-US")} Glory and ${standing.members.toLocaleString("en-US")} sworn.`
      : `${meta.motto}. One of the Houses of The Ravenspire.`,
  };
}

export default async function HousePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  /* Keyed on the slug so walking from one hall to the next remounts with fresh
     state, rather than showing the previous House's roster while the new one
     loads. */
  return <HouseHallView key={slug} slug={slug} />;
}
