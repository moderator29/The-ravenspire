"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Card } from "@/components/ui/card";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Hoard,
  type CraftState,
  type HoardCard,
  type HoardSummary,
  type MarketState,
  type MintState,
} from "@/components/collectibles/hoard";

/* The Hoard, wired to whichever read is the truthful one for this viewer.
 *
 * Two routes, because they answer two different questions. Your own Hoard is
 * /api/inventory: it carries the mint's state and the claim state of every
 * copy, because you are the only person who can act on any of it. Somebody
 * else's is /api/hoard, which carries no inventory ids and no handles to act
 * with, and which the keeper can seal.
 *
 * The panel picks one and the component renders both the same way, so the
 * trophy case looks like the trophy case wherever it is standing.
 */

type Payload = {
  cards?: HoardCard[];
  summary?: HoardSummary;
  mint?: MintState;
  /* Own reads only. /api/hoard carries no craft rule, because a visitor cannot
     burn somebody else's duplicates. */
  craft?: CraftState;
  /* Own reads only, for the same reason: a visitor cannot sell somebody else's
     card, so somebody else's Hoard carries no market terms at all. */
  market?: MarketState;
  sealed?: boolean;
};

const EMPTY_SUMMARY: HoardSummary = {
  copies: 0,
  distinct: 0,
  setSize: 0,
  byRarity: {},
  minted: 0,
  listed: 0,
};

export function HoardPanel({
  handle,
  own,
}: {
  /* Whose Keep this is. Unused for an own read, which resolves the caller
     from their own token rather than trusting a handle in the URL. */
  handle: string | null;
  own: boolean;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const showSkeleton = useDelayedLoading(payload === null && !failed, 300);

  const load = useCallback(async () => {
    const path = own
      ? "/api/inventory"
      : `/api/hoard?handle=${encodeURIComponent(handle ?? "")}`;
    if (!own && !handle) {
      setFailed(true);
      return;
    }
    const res = await realmFetch<Payload>(path);
    if (!res.ok || !res.data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setPayload(res.data);
  }, [own, handle]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    /* Honest, and quiet. A collection that could not be read is not an empty
       collection, and saying "nothing here" would be a lie about somebody
       else's property. */
    return (
      <Card>
        <p className="text-sm text-bone-mut">
          The Hoard could not be read just now. Try again in a moment.
        </p>
      </Card>
    );
  }

  if (payload === null) {
    return showSkeleton ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} radius="lg" className="aspect-[5/7] w-full" />
        ))}
      </div>
    ) : null;
  }

  return (
    <Hoard
      cards={payload.cards ?? []}
      summary={payload.summary ?? EMPTY_SUMMARY}
      own={own}
      mint={payload.mint ?? null}
      craft={payload.craft ?? null}
      market={payload.market ?? null}
      sealed={payload.sealed === true}
      onClaimed={() => void load()}
      /* The ledger has changed underneath the case: a copy is now on the
         board. Re-read rather than patch, because the ledger is the truth and
         a locally reconciled copy of it is a second answer waiting to be
         wrong. */
      onListed={() => void load()}
    />
  );
}
