"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchViewer, fetchFollowingSet } from "@/lib/social/profile-queries";
import { fetchTopPeople, type PersonHit } from "@/lib/social/explore-queries";

/* A compact "who to follow" card, the realm's most renowned, with inline
   Follow. Dropped into empty feed states so a quiet timeline immediately points
   a member at people worth following. Follow-state is batched so every button
   loads truthfully with one query. */
export function WhoToFollow({ limit = 4 }: { limit?: number }) {
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchViewer().then((v) => {
      setViewerId(v?.id ?? null);
      void fetchTopPeople(v?.id).then((list) => {
        const top = list.slice(0, limit);
        setPeople(top);
        if (v?.id && top.length > 0) {
          void fetchFollowingSet(
            v.id,
            top.map((p) => p.id)
          ).then(setFollowingSet);
        }
      });
    });
  }, [limit]);

  if (people !== null && people.length === 0) return null;

  return (
    <Card className="text-left">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-bone">
          People to follow
        </h3>
        <Button variant="ghost" size="sm" render={<Link href="/explore" />} className="text-gold">
          More
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {people === null
          ? [0, 1, 2].map((i) => (
              /* Shaped like the row it stands in for: avatar, two lines, a
                 Follow control on the right. */
              <div key={i} className="flex items-center gap-2.5" aria-hidden>
                <Skeleton radius="full" className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Skeleton radius="sm" className="h-3 w-28" />
                  <Skeleton radius="sm" className="mt-1.5 h-2.5 w-20" />
                </div>
                <Skeleton radius="md" className="h-9 w-20 shrink-0" />
              </div>
            ))
          : people.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5">
                <Link
                  href={`/u/${p.handle}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Avatar author={p} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-bone">
                      {p.display_name ?? p.handle}
                    </p>
                    <p className="truncate text-xs text-bone-faint">
                      @{p.handle}
                    </p>
                  </div>
                </Link>
                <FollowButton
                  targetId={p.id}
                  viewerId={viewerId}
                  initialFollowing={followingSet.has(p.id)}
                />
              </div>
            ))}
      </div>
    </Card>
  );
}
