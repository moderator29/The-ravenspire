"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { fetchViewer, fetchFollowingSet } from "@/lib/social/profile-queries";
import { fetchTopPeople, type PersonHit } from "@/lib/social/explore-queries";

/* A compact "who to follow" card — the realm's most renowned, with inline
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
    <div className="glass glass-sm p-4 text-left">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-bone">
          People to follow
        </h3>
        <Link href="/explore" className="text-xs text-gold hover:text-gold-bright">
          More
        </Link>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {people === null
          ? [0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-panel" />
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
    </div>
  );
}
