"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { houses } from "@/lib/data/houses";
import { Avatar } from "@/components/social/avatar";
import { Icon } from "@/components/ui/icon";
import { FollowButton } from "@/components/social/follow-button";
import { TIER_NAMES, timeAgo } from "@/lib/social/types";
import { fetchViewer, fetchFollowingSet } from "@/lib/social/profile-queries";
import {
  fetchHouseStats,
  fetchTopPeople,
  fetchTrendingCashtags,
  type Cashtag,
  type HouseStat,
  type PersonHit,
} from "@/lib/social/explore-queries";

interface ProfileHit {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
}

interface CallRow {
  id: string;
  created_at: string;
  call: { token: string; stance: "up" | "down"; timeframe: string } | null;
  author: { handle: string | null; display_name: string | null } | null;
}

const sigilIcon: Record<string, string> = {
  raven: "raven",
  flame: "flame",
  snowflake: "shield",
  storm: "signal",
  moon: "eye",
  lion: "crown",
};

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProfileHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [cashtags, setCashtags] = useState<Cashtag[] | null>(null);
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [houseStats, setHouseStats] = useState<Record<string, HouseStat>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const db = createClient();
    void db
      .from("posts")
      .select(
        "id, created_at, call, author:profiles!posts_author_id_fkey (handle, display_name)"
      )
      .eq("kind", "call")
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setCalls((data as unknown as CallRow[]) ?? []));

    void fetchTrendingCashtags().then(setCashtags);
    void fetchHouseStats().then(setHouseStats);

    /* Resolve the viewer, then the people to follow, then which of them the
       viewer already follows — all so every Follow button loads truthfully
       and in a single batched query, not one lookup per row. */
    void fetchViewer().then((v) => {
      setViewerId(v?.id ?? null);
      void fetchTopPeople(v?.id).then((list) => {
        setPeople(list);
        if (v?.id && list.length > 0) {
          void fetchFollowingSet(
            v.id,
            list.map((p) => p.id)
          ).then(setFollowingSet);
        }
      });
    });
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      const db = createClient();
      const like = `%${q.replace(/[%_]/g, "")}%`;
      void db
        .from("profiles")
        .select("id, handle, display_name, avatar_url, house_slug, tier")
        .or(`handle.ilike.${like},display_name.ilike.${like}`)
        .not("handle", "is", null)
        .limit(12)
        .then(({ data }) => {
          setHits((data as ProfileHit[]) ?? []);
          setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="font-display text-xl font-semibold text-bone">
        The Crossroads
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Explore
      </p>

      {/* Search */}
      <div className="glass glass-sm mt-5 flex items-center gap-3 px-4 py-3">
        <Icon name="search" className="h-4 w-4 shrink-0 text-bone-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the realm by name or handle"
          className="w-full bg-transparent text-sm text-bone placeholder:text-bone-faint focus:outline-none"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-3 flex flex-col gap-2">
          {searching && hits === null ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="glass glass-sm h-14 animate-pulse" />
            ))
          ) : hits && hits.length === 0 ? (
            <div className="glass glass-sm p-6 text-center text-sm text-bone-mut">
              No citizen answers to that name. Try another spelling.
            </div>
          ) : (
            (hits ?? []).map((p, i) => (
              <div
                key={p.id ?? p.handle ?? i}
                className="glass glass-sm flex items-center gap-3 p-3"
              >
                <Link
                  href={`/u/${p.handle}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar author={p} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-bone">
                      {p.display_name ?? p.handle}
                    </p>
                    <p className="truncate text-xs text-bone-faint">
                      @{p.handle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-steel-line px-2.5 py-1 text-[11px] text-bone-mut">
                    {TIER_NAMES[p.tier] ?? p.tier}
                  </span>
                </Link>
                {p.id && (
                  <FollowButton targetId={p.id} viewerId={viewerId} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Only surface discovery sections when not actively searching. */}
      {query.trim().length < 2 && (
        <>
          {/* People to follow lead the Crossroads: real citizens worth
              following come first, the talk of the realm follows below. */}
          <h2 className="mt-8 font-display text-base font-semibold text-bone">
            Lords and Ladies of Note
          </h2>
          <p className="text-xs text-bone-faint">
            The realm&apos;s most renowned, worth a follow
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {people === null ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="glass glass-sm h-14 animate-pulse" />
              ))
            ) : people.length === 0 ? (
              <div className="glass glass-sm p-6 text-center text-sm text-bone-mut">
                The realm is yet young. Its first names have not risen.
              </div>
            ) : (
              people.map((p) => (
                <div
                  key={p.id}
                  className="glass glass-sm flex items-center gap-3 p-3"
                >
                  <Link
                    href={`/u/${p.handle}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar author={p} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-bone">
                        {p.display_name ?? p.handle}
                      </p>
                      <p className="truncate text-xs text-bone-faint">
                        @{p.handle}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-right text-[11px] text-bone-faint">
                      <span className="block font-semibold text-bone-mut">
                        {p.renown.toLocaleString()}
                      </span>
                      Renown
                    </span>
                  </Link>
                  <FollowButton
                    targetId={p.id}
                    viewerId={viewerId}
                    initialFollowing={followingSet.has(p.id)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Trending cashtags */}
          <h2 className="mt-8 font-display text-base font-semibold text-bone">
            What the Realm Whispers
          </h2>
          <p className="text-xs text-bone-faint">
            Cashtags carried by the most ravens this week
          </p>
          <div className="mt-3">
            {cashtags === null ? (
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="glass glass-sm h-9 w-24 animate-pulse rounded-full"
                  />
                ))}
              </div>
            ) : cashtags.length === 0 ? (
              <div className="glass glass-sm p-6 text-center text-sm text-bone-mut">
                No cashtags have taken flight yet. Seal a Call and start the
                talk.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cashtags.map((c) => (
                  <span
                    key={c.tag}
                    className="glass glass-sm flex items-center gap-2 rounded-full px-3.5 py-1.5"
                  >
                    <Icon name="coin" className="h-3.5 w-3.5 text-gold" />
                    <span className="text-sm font-semibold text-gold-bright">
                      ${c.tag}
                    </span>
                    <span className="tnum text-[11px] text-bone-faint">
                      {c.count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Houses */}
      <h2 className="mt-8 font-display text-base font-semibold text-bone">
        The Six Houses
      </h2>
      <p className="text-xs text-bone-faint">Communities, pick your banner</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {houses.map((h) => {
          const stat = houseStats[h.slug];
          return (
            <Link
              key={h.slug}
              href={`/houses/${h.slug}`}
              className="glass glass-sm glass-hover flex items-center gap-3 p-3"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: `linear-gradient(160deg, ${h.color}22, #101017)`,
                  border: `1px solid ${h.color}44`,
                  color: h.color,
                }}
              >
                <Icon
                  name={sigilIcon[h.sigil] ?? "banner"}
                  className="h-4 w-4"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold text-bone">
                  {h.name.replace("House ", "")}
                </p>
                <p className="truncate text-[11px] text-bone-faint">
                  {stat
                    ? `${stat.member_count.toLocaleString()} sworn`
                    : h.motto}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Latest Calls */}
      <h2 className="mt-8 font-display text-base font-semibold text-bone">
        Latest Calls
      </h2>
      <p className="text-xs text-bone-faint">
        Public claims, sealed and timestamped
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {calls === null ? (
          [0, 1].map((i) => (
            <div key={i} className="glass glass-sm h-14 animate-pulse" />
          ))
        ) : calls.length === 0 ? (
          <div className="glass glass-sm p-6 text-center text-sm text-bone-mut">
            No Calls have been sealed yet. The first bold claim awaits its
            maker.
          </div>
        ) : (
          calls.map((c) => (
            <Link
              key={c.id}
              href={`/post/${c.id}`}
              className="glass glass-sm glass-hover flex items-center gap-3 p-3"
            >
              <Icon
                name="target"
                className={`h-4.5 w-4.5 shrink-0 ${
                  c.call?.stance === "up" ? "text-gold" : "text-ember-deep"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-bone">
                  <span className="font-semibold text-gold-bright">
                    {c.call?.token ?? "?"}
                  </span>{" "}
                  {c.call?.stance === "up" ? "rises" : "falls"}
                </p>
                <p className="truncate text-xs text-bone-faint">
                  called by @{c.author?.handle ?? "unknown"}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-bone-faint">
                {timeAgo(c.created_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
