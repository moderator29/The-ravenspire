"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FeedItemCard } from "@/components/stream/cards/registry";
import { WhoToFollow } from "@/components/social/who-to-follow";
import { CashtagChip } from "@/components/social/cashtag-chip";
import { BackToTop } from "@/components/shell/back-to-top";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/field";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { useDelayedLoading } from "@/components/ui/skeleton";
import {
  StreamChip,
  StreamChipRail,
  StreamColumn,
  StreamEmpty,
  StreamList,
  StreamSkeleton,
} from "@/components/stream/stream-shell";
import { fetchTrendingCashtags, type Cashtag } from "@/lib/social/explore-queries";
import { InlineComposer } from "@/components/social/inline-composer";
import {
  fetchFeedPage,
  subscribeToFeed,
  type FeedTab,
} from "@/lib/social/queries";
import {
  feedItemActorId,
  feedItemKey,
  postItem,
  type FeedItem,
} from "@/lib/feed/types";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The Ravenry, on the Stream archetype.

   One column at 640px at every width, a fixed gap with variable card heights,
   and comfortable density throughout. The tabs are a chip rail rather than a
   segmented control because the set is a filter that can grow, which is the
   rule in section 3 of the design system.

   The timeline is no longer a list of ravens. /api/feed returns ravens and the
   realm event spine already interleaved, and every item is drawn through the
   card registry, so this component knows only that a feed item exists and
   nothing at all about what kinds there are. A tenth card type never touches
   this file. */

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

const FILTER_ROWS: {
  key: keyof FeedFilters;
  label: string;
  desc: string;
}[] = [
  {
    key: "hideHerald",
    label: "Hide the Herald",
    desc: "Keep the realm's own voice out of this timeline.",
  },
  {
    key: "mediaOnly",
    label: "Media only",
    desc: "Only ravens carrying an image or a video.",
  },
  {
    key: "callsOnly",
    label: "Calls only",
    desc: "Only sealed Calls, open or settled.",
  },
];

export function Feed() {
  const { authenticated } = useRealmAuth();
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [items, setItems] = useState<FeedItem[]>([]);
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
  /* B1: `load` is a useCallback keyed on the tab, so anything it reads out of
     state is frozen at the moment that callback was built. Reading state
     directly meant "Older ravens" always paged from undefined, refetching page
     one forever and appending duplicate keys. The cursor lives in a ref, so
     paging always continues from where the last page actually stopped.

     The cursor is opaque now: it describes a position in two sources at once,
     and the browser has no business reasoning about either. */
  const cursor = useRef<string | null>(null);

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
      /* Who is reading, which House they are sworn to and who they follow are
         all resolved from the bearer token inside /api/feed. The browser no
         longer states its own audience, because it could always lie. */
      const page = await fetchFeedPage({
        tab,
        before: append ? cursor.current : null,
      });
      cursor.current = page.nextCursor;
      setDone(!page.nextCursor);
      setItems((prev) => {
        if (!append) return page.items;
        /* Belt and braces against a repeated row at a page boundary: the
           server owns the cursor, but a duplicate key here would break the
           list rather than merely repeat a card. */
        const seen = new Set(prev.map(feedItemKey));
        return [...prev, ...page.items.filter((i) => !seen.has(feedItemKey(i)))];
      });
      setLoading(false);
      setHasNew(false);
    },
    [tab]
  );

  /* Signing in or out changes which ravens the reader is admitted to, so the
     page is pulled again when auth settles, not only when the tab changes. */
  useEffect(() => {
    void load();
  }, [load, authenticated]);

  useEffect(() => {
    return subscribeToFeed(() => setHasNew(true));
  }, []);

  /* A skeleton that flashes for 200ms reads as the layout breaking, not as
     loading, so it only earns its place once the wait is real. */
  const showSkeleton = useDelayedLoading(loading);
  const activeFilters = FILTER_ROWS.filter((r) => filters[r.key]).length;

  /* Blocks and mutes reach the whole timeline, not only its ravens: a member
     you have banished does not get to reach you through a quest card either.
     The three optional filters are about ravens, so an event passes them only
     when it is the same thing the filter is asking for. */
  const visible = items.filter((item) => {
    const actor = feedItemActorId(item);
    if (actor && (blocked.has(actor) || muted.has(actor))) return false;
    if (item.type === "event") {
      if (filters.mediaOnly) return false;
      if (filters.callsOnly) return item.event.kind === "call.resolved";
      return true;
    }
    const p = item.post;
    if (filters.hideHerald && p.author.is_agent) return false;
    if (filters.mediaOnly && p.media.length === 0) return false;
    if (filters.callsOnly && p.kind !== "call") return false;
    return true;
  });

  return (
    <StreamColumn className="flex flex-col gap-3">
      {/* Posting used to cost a floating button plus a navigation to /compose.
          A new raven is prepended straight onto the current page rather than
          triggering a refetch, so the member keeps their place in the feed. */}
      <InlineComposer
        onPosted={(post) => {
          if (post) setItems((prev) => [postItem(post), ...prev]);
        }}
      />

      <div className="flex items-center gap-2">
        <StreamChipRail label="Feed views" className="flex-1">
          {TABS.map((t) => (
            <StreamChip
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </StreamChip>
          ))}
        </StreamChipRail>
        <Button
          variant={activeFilters > 0 ? "gold" : "glass"}
          size="lg"
          onClick={() => setFiltersOpen(true)}
          aria-label="Feed filters"
          pad="md"
          className="shrink-0"
        >
          <Icon name="sliders" className="h-4 w-4" />
          {activeFilters > 0 ? (
            <span className="tnum text-xs">{activeFilters}</span>
          ) : null}
        </Button>
      </div>

      <AdaptiveDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Feed filters"
        description="Blocked members never appear, whatever is set here."
        size="sm"
      >
        <div className="flex flex-col">
          {FILTER_ROWS.map((row) => (
            <CardRow key={row.key} title={row.label} desc={row.desc}>
              <Toggle
                checked={filters[row.key]}
                onCheckedChange={(next) =>
                  setFilters((f) => ({ ...f, [row.key]: next }))
                }
                label={row.label}
              />
            </CardRow>
          ))}
        </div>
      </AdaptiveDialog>

      {trending.length > 0 && (
        <StreamChipRail label="Trending cashtags">
          <span className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
            Trending
          </span>
          {trending.map((t) => (
            <CashtagChip key={t.tag} tag={`$${t.tag}`} chip />
          ))}
        </StreamChipRail>
      )}

      {hasNew && (
        <div className="sticky top-2 z-sticky flex justify-center">
          <Button
            variant="gold"
            size="md"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              void load();
            }}
          >
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-obsidian/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-obsidian" />
            </span>
            New ravens have arrived
          </Button>
        </div>
      )}

      <BackToTop />

      {loading ? (
        showSkeleton ? (
          <StreamSkeleton />
        ) : null
      ) : visible.length === 0 ? (
        <StreamList>
          <FeedEmpty tab={tab} authenticated={authenticated} />
          {authenticated && <WhoToFollow />}
        </StreamList>
      ) : (
        <StreamList>
          {visible.map((item) => (
            <FeedItemCard key={feedItemKey(item)} item={item} />
          ))}
          {!done && (
            <Button
              variant="glass"
              size="lg"
              onClick={() => void load(true)}
              className="mx-auto text-bone-mut"
            >
              Earlier in the realm
            </Button>
          )}
        </StreamList>
      )}
    </StreamColumn>
  );
}

/* An honest empty timeline, with a way out of it.

   Real data only means empty is a first class state, so every branch here names
   what is missing and offers the one action that fills it. Never a seeded row. */
function FeedEmpty({
  tab,
  authenticated,
}: {
  tab: FeedTab;
  authenticated: boolean;
}) {
  if (!authenticated) {
    return (
      <StreamEmpty
        icon="gatehouse"
        title="Enter the realm to see this"
        body={
          tab === "following"
            ? "The people you follow appear here once you are signed in."
            : "Your House hall opens once you are signed in and sworn."
        }
        action={
          <Button variant="gold" size="lg" render={<Link href="/signin" />}>
            Sign in
          </Button>
        }
      />
    );
  }

  if (tab === "following") {
    return (
      <StreamEmpty
        icon="gathering"
        title="You follow no one yet"
        body="The Crossroads is a fine place to find your people."
        action={
          <Button variant="gold" size="lg" render={<Link href="/explore" />}>
            Visit the Crossroads
          </Button>
        }
      />
    );
  }

  if (tab === "houses") {
    return (
      <StreamEmpty
        icon="banner"
        title="No word from your House yet"
        body="Send the first raven and your hall has something to carry."
        action={
          <Button variant="gold" size="lg" render={<Link href="/compose" />}>
            Send a raven
          </Button>
        }
      />
    );
  }

  return (
    <StreamEmpty
      icon="raven"
      title="The ravens carry no word yet"
      body="Send the first raven of the realm, or seal a Call and let the market judge it."
      action={
        <Button variant="gold" size="lg" render={<Link href="/compose" />}>
          Send a raven
        </Button>
      }
    />
  );
}
