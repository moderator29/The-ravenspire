"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ActorName,
  CARD_ACTION_CLASS,
  SystemCard,
  payloadText,
} from "@/components/stream/cards/card-shell";
import { houseBySlug, houseIcon } from "@/lib/data/houses";
import type { FeedEvent } from "@/lib/feed/types";

/* An oath, sworn.
 *
 * A member choosing a banner, or leaving one for another. House scoped, so the
 * rail takes the House's colour rather than gold. Ledger register: swearing is
 * a commitment the realm should see, not a ceremony, and the House hall behind
 * the action is where the weight belongs. */

export function OathSwornCard({ event }: { event: FeedEvent }) {
  const toSlug = payloadText(event.payload, "to") ?? event.house_slug;
  const to = houseBySlug(toSlug);
  const toName = to?.name ?? payloadText(event.payload, "to_name");
  if (!toName) return null;

  const fromSlug = payloadText(event.payload, "from");
  const from = houseBySlug(fromSlug);
  const fromName = from?.name ?? payloadText(event.payload, "from_name");
  const moved = Boolean(fromName) && fromSlug !== toSlug;

  return (
    <SystemCard
      at={event.created_at}
      icon={houseIcon(toSlug)}
      label="Oath"
      {...(to ? { rail: "house" as const, railColor: to.color } : {})}
      action={
        to ? (
          <Button
            variant="ghost"
            size="md"
            render={<Link href={`/houses/${to.slug}`} />}
            className={CARD_ACTION_CLASS}
          >
            See the House
          </Button>
        ) : undefined
      }
    >
      <p>
        <ActorName event={event} /> swore to{" "}
        <span className="font-medium text-bone">{toName}</span>
        {moved ? (
          <>
            , leaving <span className="text-bone">{fromName}</span> behind.
          </>
        ) : (
          "."
        )}
      </p>
    </SystemCard>
  );
}
