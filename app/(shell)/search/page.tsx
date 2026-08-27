"use client";

import { Suspense, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/field";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BackButton } from "@/components/shell/back-button";
import { Avatar } from "@/components/social/avatar";
import { realmFetch } from "@/lib/auth/api";
import { StreamColumn } from "@/components/stream/stream-shell";

/* Global search: members, cashtags and posts from anywhere in the realm. Real
   data only, live as you type, with honest empty states.

   A FAILED SEARCH IS NOT AN EMPTY REALM, and for a while this page said it was.
   Any error from /api/search, a dropped connection included, fell through the
   `res.data ?? { users: [], posts: [], cashtags: [] }` default and rendered as
   "Nothing found for ...", which is the product asserting a fact about the
   realm on the strength of a request that never landed. The two states are
   branched apart now: an empty result is an empty result, and a read that did
   not complete says so and offers the retry, because a search is the one thing
   here a member will happily run twice. */

interface UserResult {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  tier: string | null;
  isVerified: boolean;
}
interface PostResult {
  id: string;
  body: string;
  createdAt: string;
  cashtags: string[];
  author: {
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    isVerified: boolean;
  };
}
interface CashtagResult {
  tag: string;
  count: number;
}
interface Results {
  users: UserResult[];
  posts: PostResult[];
  cashtags: CashtagResult[];
}

/* useSearchParams() opts a component out of static rendering, so Next requires
   it to sit under a Suspense boundary. Without one the production build fails
   while prerendering this route, which is exactly what it was doing. The
   boundary lives here rather than in the shell layout so only the search body
   waits on the URL, not the whole page frame. */
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchBody />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <StreamColumn className="px-4 py-6">
      <BackButton />
      <Card pad="none" className="mt-4 h-12 animate-pulse" />
    </StreamColumn>
  );
}

function SearchBody() {
  /* Seed the query from the URL so deep links like /search?q=$NAKA (from the
     right rail's trending cashtags) land pre-searched. */
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [results, setResults] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  /* Bumped by the retry control. The effect already owns the read, so the
     retry asks for the same read again rather than growing a second one. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setFailed(false);
    const t = setTimeout(async () => {
      const res = await realmFetch<Results>(
        `/api/search?q=${encodeURIComponent(query.trim())}`
      );
      if (cancelled) return;
      setSearching(false);
      if (!res.ok || !res.data) {
        setResults(null);
        setFailed(true);
        return;
      }
      setResults(res.data);
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, attempt]);

  const empty =
    results !== null &&
    results.users.length === 0 &&
    results.posts.length === 0 &&
    results.cashtags.length === 0;

  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <h1 className="font-display text-xl font-semibold text-bone">Search</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Members, cashtags, posts
      </p>

      {/* Three things were wrong with this field and all three came from it
          being hand written rather than the primitive.

          It sat at `--radius-2xl`, which is 26px, on a 49px box. That rung is
          for modals, sheets and the nav shell; at this height it reads as the
          capsule the design rules exist to keep off controls. Inputs are
          `--radius-md`.

          The input itself carried no height at all, so it rendered at 23px
          inside a 49px label. The row was hittable, which is why no audit
          flagged it, but the 44px floor was coming from the parent's padding
          by accident rather than from the control by design.

          And the clear control drew its X by rotating the `plus` glyph forty
          five degrees, which is the exact thing the icon set grew a `close`
          glyph to stop. */}
      <label className="relative mt-4 block">
        <span className="sr-only">Search the realm</span>
        <Icon
          name="search"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-faint"
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the realm"
          spellCheck={false}
          className="h-11 pl-10 pr-11"
        />
        {query && (
          <IconButton
            icon="close"
            label="Clear search"
            size="sm"
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          />
        )}
      </label>

      <div className="mt-5">
        {query.trim().length < 2 ? (
          <p className="px-1 text-sm text-bone-faint">
            Find members by name or handle, a cashtag like $ETH, or any post.
          </p>
        ) : searching && results === null ? (
          <div className="flex items-center gap-2 px-1 text-sm text-bone-faint">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
            Searching the realm...
          </div>
        ) : failed ? (
          <Card pad="none">
            <EmptyState
              icon="search"
              title="The search did not reach the realm"
              body="Nothing was found and nothing was missing: the read itself failed. Ask again and it will most likely land."
              action={
                <Button
                  variant="glass"
                  size="md"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Try again
                </Button>
              }
            />
          </Card>
        ) : empty ? (
          <Card pad="none">
            <EmptyState
              icon3d="search"
              title={`Nothing found for "${query.trim()}"`}
              body="No member, cashtag or raven in the realm answers to that. Try a shorter name or a different cashtag."
            />
          </Card>
        ) : (
          results && (
            <div className="flex flex-col gap-6">
              {results.cashtags.length > 0 && (
                <Section label="Cashtags">
                  {results.cashtags.map((c) => (
                    <Card key={c.tag} render={<Link href={`/coin/${encodeURIComponent(c.tag)}?sym=${encodeURIComponent(c.tag)}`} />} radius="lg" pad="none" className="flex items-center gap-3 px-3.5 py-3 transition hover:border-gold/30">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-panel-warm text-sm font-semibold text-gold">
                        $
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-bone">
                          ${c.tag}
                        </p>
                        <p className="text-[11px] text-bone-faint">
                          {c.count} {c.count === 1 ? "mention" : "mentions"} in
                          the realm
                        </p>
                      </div>
                      <Icon name="arrow" className="h-4 w-4 shrink-0 text-bone-faint" />
                    </Card>
                  ))}
                </Section>
              )}

              {results.users.length > 0 && (
                <Section label="Members">
                  {results.users.map((u) => {
                    const name =
                      u.displayName ?? (u.handle ? `@${u.handle}` : "A member");
                    return (
                      <Card key={u.id} render={<Link href={u.handle ? `/u/${u.handle}` : "#"} />} radius="lg" pad="none" className="flex items-center gap-3 px-3.5 py-3 transition hover:border-gold/30">
                        {/* The realm's own face, rather than a third copy of
                            one. The hand rolled pair this replaced drew a bare
                            portrait with no House tint and, with no portrait,
                            a grey glyph where every other surface draws the
                            member's initial. */}
                        <Avatar
                          author={{
                            handle: u.handle,
                            display_name: u.displayName,
                            avatar_url: u.avatarUrl,
                            house_slug: null,
                          }}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-bone">
                              {name}
                            </p>
                            {u.isVerified && (
                              <Icon name="medal" className="h-3.5 w-3.5 shrink-0 text-gold" />
                            )}
                          </div>
                          {u.handle && (
                            <p className="truncate text-[11px] text-bone-faint">
                              @{u.handle}
                              {u.tier ? ` · ${u.tier}` : ""}
                            </p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </Section>
              )}

              {results.posts.length > 0 && (
                <Section label="Posts">
                  {results.posts.map((p) => {
                    const name =
                      p.author.displayName ??
                      (p.author.handle ? `@${p.author.handle}` : "A member");
                    return (
                      <Card key={p.id} render={<Link href={`/post/${p.id}`} />} radius="lg" pad="none" className="flex flex-col gap-1.5 px-3.5 py-3 transition hover:border-gold/30">
                        <div className="flex items-center gap-2">
                          <Avatar
                            author={{
                              handle: p.author.handle,
                              display_name: p.author.displayName,
                              avatar_url: p.author.avatarUrl,
                              house_slug: null,
                            }}
                            size={24}
                          />
                          <span className="truncate text-xs font-medium text-bone-mut">
                            {name}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-bone">{p.body}</p>
                      </Card>
                    );
                  })}
                </Section>
              )}
            </div>
          )
        )}
      </div>
    </StreamColumn>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        {label}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}
