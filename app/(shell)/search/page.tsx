"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";

/* Global search: members, cashtags and posts from anywhere in the realm. Real
   data only, live as you type, with honest empty states. */

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

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await realmFetch<Results>(
        `/api/search?q=${encodeURIComponent(query.trim())}`
      );
      if (cancelled) return;
      setResults(
        res.data ?? { users: [], posts: [], cashtags: [] }
      );
      setSearching(false);
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const empty =
    results !== null &&
    results.users.length === 0 &&
    results.posts.length === 0 &&
    results.cashtags.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <h1 className="font-display text-xl font-semibold text-bone">Search</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Members, cashtags, posts
      </p>

      <label className="mt-4 flex items-center gap-2 rounded-2xl border border-steel-line bg-void px-3.5 py-3 focus-within:border-gold/40">
        <Icon name="search" className="h-4 w-4 shrink-0 text-bone-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the realm"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-bone placeholder-bone-faint outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="text-bone-faint hover:text-bone-mut"
          >
            <Icon name="plus" className="h-4 w-4 rotate-45" />
          </button>
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
        ) : empty ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            Nothing found for &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : (
          results && (
            <div className="flex flex-col gap-6">
              {results.cashtags.length > 0 && (
                <Section label="Cashtags">
                  {results.cashtags.map((c) => (
                    <Link
                      key={c.tag}
                      href={`/coin/${encodeURIComponent(c.tag)}?sym=${encodeURIComponent(c.tag)}`}
                      className="glass glass-sm flex items-center gap-3 px-3.5 py-3 transition hover:border-gold/30"
                    >
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
                    </Link>
                  ))}
                </Section>
              )}

              {results.users.length > 0 && (
                <Section label="Members">
                  {results.users.map((u) => {
                    const name =
                      u.displayName ?? (u.handle ? `@${u.handle}` : "A member");
                    return (
                      <Link
                        key={u.id}
                        href={u.handle ? `/u/${u.handle}` : "#"}
                        className="glass glass-sm flex items-center gap-3 px-3.5 py-3 transition hover:border-gold/30"
                      >
                        {u.avatarUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full border border-steel-line object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
                            <Icon name="user" className="h-5 w-5" />
                          </div>
                        )}
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
                      </Link>
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
                      <Link
                        key={p.id}
                        href={`/post/${p.id}`}
                        className="glass glass-sm flex flex-col gap-1.5 px-3.5 py-3 transition hover:border-gold/30"
                      >
                        <div className="flex items-center gap-2">
                          {p.author.avatarUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={p.author.avatarUrl}
                              alt=""
                              className="h-6 w-6 shrink-0 rounded-full border border-steel-line object-cover"
                            />
                          ) : (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-void text-bone-mut">
                              <Icon name="user" className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <span className="truncate text-xs font-medium text-bone-mut">
                            {name}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-bone">{p.body}</p>
                      </Link>
                    );
                  })}
                </Section>
              )}
            </div>
          )
        )}
      </div>
    </div>
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
