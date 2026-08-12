"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { BackButton } from "@/components/shell/back-button";
import { PostCard } from "@/components/social/post-card";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";
import { StreamColumn } from "@/components/stream/stream-shell";

export default function BookmarksPage() {
  const { ready, authenticated } = useRealmAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void realmFetch<{ posts?: Post[] }>("/api/bookmarks").then((res) =>
      setPosts(res.data?.posts ?? [])
    );
  }, [ready, authenticated]);

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
        ) : posts === null ? (
          [0, 1].map((i) => (
            <Card key={i} radius="lg" pad="none" className="h-24 animate-pulse" />
          ))
        ) : posts.length === 0 ? (
          <Card pad="none" className="p-8 text-center text-sm text-bone-mut">
            Nothing saved yet. The bookmark mark on any raven places it here.
          </Card>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </StreamColumn>
  );
}
