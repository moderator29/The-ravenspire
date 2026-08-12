"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { houses, sigilIcon } from "@/lib/data/houses";
import { Avatar } from "@/components/social/avatar";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/field";
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
import {
  StreamChip,
  StreamChipRail,
  StreamColumn,
} from "@/components/stream/stream-shell";

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

/* The two discovery lists the Crossroads offers, and the only thing `?view=`
   selects. Houses and Latest Calls are the standing furniture of the route and
   show under both. */
const VIEWS = [
  { key: "people", label: "People" },
  { key: "cashtags", label: "Cashtags" },
] as const;

type ExploreView = (typeof VIEWS)[number]["key"];

function viewFromParam(raw: string | null): ExploreView {
  return VIEWS.some((v) => v.key === raw) ? (raw as ExploreView) : "people";
}

/* useSearchParams() opts a component out of static rendering, so the reading
   half sits behind a boundary and the route still prerenders. Without it this
   page fails to build exactly the way the Ravenry did. */
export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreFallback />}>
      <ExploreBody />
    </Suspense>
  );
}

function ExploreFallback() {
  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="font-display text-xl font-semibold text-bone">
        The Crossroads
      </h1>
      <Card radius="lg" pad="none" className="mt-5 h-12 animate-pulse" />
    </StreamColumn>
  );
}

function ExploreBody() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = viewFromParam(params.get("view"));

  /* The dock's contextual strip already links `?view=cashtags` on a phone, and
     this page used to keep no view at all, so that chip changed the address bar
     and nothing else. The view lives in the URL now, which makes the dock work
     and keeps it and the rail from ever disagreeing. */
  const setView = useCallback(
    (next: ExploreView) => {
      const query = new URLSearchParams(params.toString());
      if (next === "people") query.delete("view");
      else query.set("view", next);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProfileHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [cashtags, setCashtags] = useState<Cashtag[] | null>(null);
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [houseStats, setHouseStats] = useState<Record<string, HouseStat>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  /* Every one of these lands on an honest empty state when it fails, rather
     than leaving its list null, because null is what draws the skeleton and a
     skeleton that never resolves is a claim that something is still coming.
     This screen had fifteen of them pulsing at once on a failed load. */
  useEffect(() => {
    const db = createClient();
    void (async () => {
      try {
        const { data } = await db
          .from("posts")
          .select(
            "id, created_at, call, author:profiles!posts_author_id_fkey (handle, display_name)"
          )
          .eq("kind", "call")
          .eq("deleted", false)
          .order("created_at", { ascending: false })
          .limit(5);
        setCalls((data as unknown as CallRow[]) ?? []);
      } catch {
        setCalls([]);
      }
    })();

    void (async () => {
      try {
        setCashtags(await fetchTrendingCashtags());
      } catch {
        setCashtags([]);
      }
    })();

    /* House stats only enrich the six static banners, so a failure here costs
       a number rather than a section, and the banners still render. */
    void fetchHouseStats()
      .then(setHouseStats)
      .catch(() => setHouseStats({}));

    /* Resolve the viewer, then the people to follow, then which of them the
       viewer already follows, all so every Follow button loads truthfully
       and in a single batched query, not one lookup per row. */
    void (async () => {
      try {
        const viewer = await fetchViewer();
        setViewerId(viewer?.id ?? null);
        const list = await fetchTopPeople(viewer?.id);
        setPeople(list);
        if (viewer?.id && list.length > 0) {
          setFollowingSet(
            await fetchFollowingSet(
              viewer.id,
              list.map((p) => p.id)
            )
          );
        }
      } catch {
        setPeople([]);
      }
    })();
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
      void (async () => {
        try {
          const { data } = await db
            .from("profiles")
            .select("id, handle, display_name, avatar_url, house_slug, tier")
            .or(`handle.ilike.${like},display_name.ilike.${like}`)
            .not("handle", "is", null)
            .limit(12);
          setHits((data as ProfileHit[]) ?? []);
        } catch {
          /* A search that failed answers "nothing found" rather than staying
             on the searching skeleton forever. */
          setHits([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="font-display text-xl font-semibold text-bone">
        The Crossroads
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Explore
      </p>

      {/* Search.

          Was a bare `<input>` inside a Card, carrying no height, so it rendered
          at 23px. The row around it was tall enough to hit, which is why no
          audit ever flagged it, but the floor was coming from the Card's
          padding by accident rather than from the control by design. The same
          shape was on the Search screen and is fixed the same way: the `Input`
          primitive, which carries the 44px floor, the radius rung and the
          recessed shadow that every other field in the realm has. */}
      <label className="relative mt-5 block">
        <span className="sr-only">Search the realm by name or handle</span>
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-faint"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the realm by name or handle"
          className="h-11 pl-10"
        />
      </label>

      {query.trim().length >= 2 && (
        <div className="mt-3 flex flex-col gap-2">
          {searching && hits === null ? (
            [0, 1, 2].map((i) => (
              <Card key={i} radius="lg" pad="none" className="h-14 animate-pulse" />
            ))
          ) : hits && hits.length === 0 ? (
            <Card radius="lg" pad="none" className="p-6 text-center text-sm text-bone-mut">
              No citizen answers to that name. Try another spelling.
            </Card>
          ) : (
            (hits ?? []).map((p, i) => (
              <Card key={p.id ?? p.handle ?? i} radius="lg" pad="none" className="flex items-center gap-3 p-3">
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
                  <span className="shrink-0 rounded-sm border border-steel-line px-2.5 py-1 text-[11px] text-bone-mut">
                    {TIER_NAMES[p.tier] ?? p.tier}
                  </span>
                </Link>
                {p.id && (
                  <FollowButton targetId={p.id} viewerId={viewerId} />
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Only surface discovery sections when not actively searching. */}
      {query.trim().length < 2 && (
        <>
          {/* The desktop half of one control. Below lg the dock carries these
              same two views a thumb's width above the content, so the rail is
              hidden there and both write the same `?view=`. */}
          <StreamChipRail label="Crossroads views" className="mt-6 max-lg:hidden">
            {VIEWS.map((v) => (
              <StreamChip
                key={v.key}
                active={view === v.key}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </StreamChip>
            ))}
          </StreamChipRail>

          {view === "people" && (
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
                  <Card key={i} radius="lg" pad="none" className="h-14 animate-pulse" />
                ))
              ) : people.length === 0 ? (
                <Card radius="lg" pad="none" className="p-6 text-center text-sm text-bone-mut">
                  The realm is yet young. Its first names have not risen.
                </Card>
              ) : (
                people.map((p) => (
                  <Card key={p.id} radius="lg" pad="none" className="flex items-center gap-3 p-3">
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
                  </Card>
                ))
              )}
            </div>
            </>
          )}

          {view === "cashtags" && (
            <>
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
                    <Card key={i} radius="lg" pad="none" className="h-9 w-24 animate-pulse" />
                  ))}
                </div>
              ) : cashtags.length === 0 ? (
                <Card radius="lg" pad="none" className="p-6 text-center text-sm text-bone-mut">
                  No cashtags have taken flight yet. Seal a Call and start the
                  talk.
                </Card>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {cashtags.map((c) => (
                    <Card key={c.tag} render={<span />} radius="lg" pad="none" className="flex items-center gap-2 px-3.5 py-1.5">
                      <Icon name="coin" className="h-3.5 w-3.5 text-gold" />
                      <span className="text-sm font-semibold text-gold-bright">
                        ${c.tag}
                      </span>
                      <span className="tnum text-[11px] text-bone-faint">
                        {c.count}
                      </span>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            </>
          )}
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
            <Card key={h.slug} render={<Link href={`/houses/${h.slug}`} />} radius="lg" pad="none" interactive className="flex items-center gap-3 p-3">
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
            </Card>
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
            <Card key={i} radius="lg" pad="none" className="h-14 animate-pulse" />
          ))
        ) : calls.length === 0 ? (
          <Card radius="lg" pad="none" className="p-6 text-center text-sm text-bone-mut">
            No Calls have been sealed yet. The first bold claim awaits its
            maker.
          </Card>
        ) : (
          calls.map((c) => (
            <Card key={c.id} render={<Link href={`/post/${c.id}`} />} radius="lg" pad="none" interactive className="flex items-center gap-3 p-3">
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
            </Card>
          ))
        )}
      </div>
    </StreamColumn>
  );
}
