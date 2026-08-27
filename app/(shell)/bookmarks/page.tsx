"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import Link from "next/link";
import { BackButton } from "@/components/shell/back-button";
import { PostCard } from "@/components/social/post-card";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";
import { StreamColumn } from "@/components/stream/stream-shell";

/* The shelf of saved ravens.

   Two things were wrong with the read and they were the same thing twice. The
   page drew two grey slabs the instant it mounted, which on a shelf that
   usually lands in under a tenth of a second reads as the layout flinching
   rather than as loading; and a read that failed fell through
   `res.data?.posts ?? []` into "Nothing saved yet", telling a member their
   shelf is empty on the strength of a request that never came back. A shelf
   that could not be read is not an empty shelf. */

/* Shaped like the raven that is arriving: a face, a name, two lines of body. */
function SavedRavenSkeleton() {
  return (
    <Card radius="lg" pad="md" className="flex items-start gap-3">
      <Skeleton radius="full" className="h-10 w-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <Skeleton radius="sm" className="h-3 w-2/5" />
        <Skeleton radius="sm" className="h-3 w-full" />
        <Skeleton radius="sm" className="h-3 w-3/5" />
      </div>
    </Card>
  );
}

export default function BookmarksPage() {
  const { ready, authenticated } = useRealmAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /* Derived rather than held. There is no state here that a fourth flag would
     record: the shelf is loading exactly when the realm has been asked and has
     not answered either way. Keeping it as state would mean setting it inside
     the effect for the signed out case, which is a cascading render for a fact
     already on screen. */
  const loading = ready && authenticated && posts === null && !failed;
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void realmFetch<{ posts?: Post[] }>("/api/bookmarks").then((res) => {
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setFailed(true);
        return;
      }
      setPosts(res.data.posts ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, attempt]);

  return (
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />
      <h1 className="mt-3 font-display text-xl font-semibold text-bone">Bookmarks</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Saved ravens
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {!authenticated ? (
          /* The one thing a signed out member can do here was an underlined
             word inside a sentence, seventeen pixels tall. Every other empty
             state in the realm carries a real control, and this is the whole
             screen for anyone not signed in. */
          <Card pad="none">
            <EmptyState
              icon3d="archive"
              title="Nothing saved yet"
              body="Enter the realm to keep a shelf of saved ravens."
              action={
                <Button variant="gold" size="lg" render={<Link href="/signin" />}>
                  Enter the realm
                </Button>
              }
            />
          </Card>
        ) : failed ? (
          <Card pad="none">
            <EmptyState
              icon="bookmark"
              title="The shelf would not open"
              body="Your saved ravens could not be read just now. Nothing has been lost from the shelf."
              action={
                <Button
                  variant="glass"
                  size="md"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Try again
                </Button>
              }
            />
          </Card>
        ) : posts === null ? (
          showSkeleton ? (
            [0, 1].map((i) => <SavedRavenSkeleton key={i} />)
          ) : null
        ) : posts.length === 0 ? (
          <Card pad="none">
            <EmptyState
              icon3d="archive"
              title="Nothing saved yet"
              body="The bookmark mark on any raven places it here."
            />
          </Card>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </StreamColumn>
  );
}
