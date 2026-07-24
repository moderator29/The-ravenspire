"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PostCard } from "@/components/social/post-card";
import { WhoToFollow } from "@/components/social/who-to-follow";
import { CashtagChip } from "@/components/social/cashtag-chip";
import { BackToTop } from "@/components/shell/back-to-top";
import { Icon } from "@/components/ui/icon";
import { fetchTrendingCashtags, type Cashtag } from "@/lib/social/explore-queries";
import {
  fetchFeed,
  subscribeToFeed,
  fetchFollowingIds,
  type FeedTab,
} from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

const TABS: { key: FeedTab; label: string }[] = [
  { key: "foryou", label: "For You" },
  { key: "following", label: "Following" },
  { key: "houses", label: "My House" },
  { key: "signal", label: "Signal" },
  { key: "latest", label: "Latest" },
];

interface FeedFilters {
  hideHerald: boolean;
  mediaOnly: boolean;
  callsOnly: boolean;
}

export function Feed() {
  const { authenticated } = useRealmAuth();
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const [done, setDone] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>({
    hideHerald: false,
    mediaOnly: false,
    callsOnly: false,
  });
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [trending, setTrending] = useState<Cashtag[]>([]);

  /* The cashtags the realm is carrying most this week, tappable straight into a
     live coin sheet. Loaded once; a quiet discovery rail above the feed. */
  useEffect(() => {
    void fetchTrendingCashtags().then((tags) => setTrending(tags.slice(0, 8)));
  }, []);
  const me = useRef<{
    id: string;
    handle: string | null;
    house_slug: string | null;
  } | null>(null);
  const followingIds = useRef<string[] | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    void realmFetch<{ blocked?: string[] }>("/api/blocks").then((res) => {
      if (res.data?.blocked) setBlocked(new Set(res.data.blocked));
    });
    void realmFetch<{ muted?: string[] }>("/api/mutes").then((res) => {
      if (res.data?.muted) setMuted(new Set(res.data.muted));
    });
  }, [authenticated]);

  const load = useCallback(
    async (append = false) => {
      setLoading(!append);
      /* Audience gating needs to know who is reading, on every tab, so a
         follower-only or House raven can reach an eligible member here too. */
      if (authenticated && !me.current) {
        const res = await realmFetch<{
          profile?: { id: string; handle: string | null; house_slug: string | null };
        }>("/api/me", { method: "POST" });
        if (res.data?.profile) me.current = res.data.profile;
      }
      if (authenticated && me.current && followingIds.current === null) {
        followingIds.current = await fetchFollowingIds(me.current.id);
      }
      const last = posts[posts.length - 1];
      const before = append
        ? (last?.effectiveTime ?? last?.created_at)
        : undefined;
      const batch = await fetchFeed({
        tab,
        before,
        followingIds: followingIds.current ?? [],
        houseSlug: me.current?.house_slug ?? null,
        viewerId: me.current?.id ?? null,
        viewerHandle: me.current?.handle ?? null,
      });
      setDone(batch.length < 30);
      setPosts((prev) => (append ? [...prev, ...batch] : batch));
      setLoading(false);
      setHasNew(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, authenticated]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeToFeed(() => setHasNew(true));
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Filter sits on its own line above the tabs, right-aligned, so it never
          overlaps the Signal/Latest tabs or scatters the row. */}
      <div className="relative flex justify-end">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label="Feed filters"
          aria-expanded={filtersOpen}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
            filtersOpen ||
            filters.hideHerald ||
            filters.mediaOnly ||
            filters.callsOnly
              ? "btn-gold"
              : "btn-glass text-bone-mut"
          }`}
        >
          <Icon name="sliders" className="h-4 w-4" />
          Filters
        </button>
        {filtersOpen && (
          <>
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div className="glass glass-sm absolute right-0 top-10 z-50 w-56 p-3">
              {(
                [
                  ["hideHerald", "Hide the Herald's posts"],
                  ["mediaOnly", "Media only"],
                  ["callsOnly", "Calls only"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs text-bone-mut hover:bg-panel"
                >
                  {label}
                  <span
                    className={`h-3.5 w-6 rounded-full border transition ${
                      filters[key]
                        ? "gold-metal border-gold-bright/60"
                        : "border-steel-line bg-steel-deep"
                    }`}
                  />
                </button>
              ))}
              <p className="mt-1 px-2 text-[10px] text-bone-faint">
                Blocked members never appear.
              </p>
            </div>
          </>
        )}
      </div>
      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "btn-gold" : "btn-glass text-bone-mut"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {trending.length > 0 && (
        <div className="scrollbar-none -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
            Trending
          </span>
          {trending.map((t) => (
            <span
              key={t.tag}
              className="shrink-0 rounded-full border border-steel-line bg-void px-2.5 py-1 text-xs"
            >
              <CashtagChip tag={`$${t.tag}`} />
            </span>
          ))}
        </div>
      )}

      {hasNew && (
        <div className="sticky top-2 z-30 flex justify-center">
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              void load();
            }}
            className="btn-gold flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-xl active:scale-95"
          >
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-obsidian/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-obsidian" />
            </span>
            New ravens have arrived
          </button>
        </div>
      )}

      <BackToTop />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-28 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="glass p-8 text-center text-sm text-bone-mut">
            {tab === "following"
              ? authenticated
                ? "You follow no one yet. The Crossroads is a fine place to find your people."
                : "Sign in to see the creators you follow."
              : tab === "houses"
                ? authenticated
                  ? "No word from your House yet. Send the first raven."
                  : "Sign in and join a House to see its hall."
                : "The ravens carry no word yet. Send the first raven of the realm."}
          </div>
          {authenticated && <WhoToFollow />}
        </div>
      ) : (
        <>
          {posts
            .filter((p) => !blocked.has(p.author_id))
            .filter((p) => !muted.has(p.author_id))
            .filter((p) => !filters.hideHerald || !p.author.is_agent)
            .filter((p) => !filters.mediaOnly || p.media.length > 0)
            .filter((p) => !filters.callsOnly || p.kind === "call")
            .map((p) => (
              <PostCard
                key={`${p.id}:${p.repostedBy ? p.effectiveTime : "own"}`}
                post={p}
              />
            ))}
          {!done && (
            <button
              onClick={() => void load(true)}
              className="btn-glass mx-auto px-5 py-2 text-xs text-bone-mut"
            >
              Older ravens
            </button>
          )}
        </>
      )}
    </div>
  );
}
