"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CARD_ACTION_CLASS,
  CardFact,
  CardFacts,
  ForgeCard,
  payloadNumber,
  payloadText,
} from "@/components/stream/cards/card-shell";
import { houseBySlug } from "@/lib/data/houses";
import type { FeedEvent } from "@/lib/feed/types";

/* One House passing another.
 *
 * The second and last Forge card in the feed. A rivalry changing hands is the
 * only thing in the realm that happens to a whole House at once, and it is the
 * reason anybody checks the standings, so it is worth the register.
 *
 * The rail takes the House's own colour rather than gold, per the rail table:
 * anything scoped to a House is painted by that House. No actor: the seasonal
 * recompute writes this, not a member. */

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function place(rank: number): string {
  return ORDINALS[rank - 1] ?? `${rank}th`;
}

export function HouseOvertakeCard({ event }: { event: FeedEvent }) {
  const slug = event.house_slug ?? event.subject_id;
  const house = houseBySlug(slug);
  const passed = houseBySlug(payloadText(event.payload, "passed"));
  /* Without both banners this is not a rivalry, it is a rank change, and the
     card would be naming a House the realm cannot identify. */
  if (!house || !passed) return null;

  const rank = payloadNumber(event.payload, "rank");
  const season = payloadNumber(event.payload, "season_id");

  return (
    <ForgeCard
      event={event}
      icon="rivalry"
      label="Rivalry"
      rail="house"
      railColor={house.color}
      action={
        <Button
          variant="glass"
          size="md"
          render={<Link href={`/houses/${house.slug}`} />}
          className={CARD_ACTION_CLASS}
        >
          See the standings
        </Button>
      }
    >
      <p>
        <span className="font-semibold text-bone">{house.name}</span> passed{" "}
        <span className="font-medium text-bone">{passed.name}</span>
        {rank !== null ? (
          <> and now stands {place(rank)} in the realm.</>
        ) : (
          <> in the standings.</>
        )}
      </p>
      {season !== null ? (
        <CardFacts>
          <CardFact label="Season" value={season} />
        </CardFacts>
      ) : null}
    </ForgeCard>
  );
}
