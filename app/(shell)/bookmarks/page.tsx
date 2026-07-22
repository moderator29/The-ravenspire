"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/shell/back-button";
import { PostCard } from "@/components/social/post-card";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";

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
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />
      <h1 className="mt-3 font-display text-xl font-semibold text-bone">Bookmarks</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Saved ravens
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {!authenticated ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            <Link href="/signin" className="text-gold underline">
              Enter the realm
            </Link>{" "}
            to keep a shelf of saved ravens.
          </div>
        ) : posts === null ? (
          [0, 1].map((i) => (
            <div key={i} className="glass glass-sm h-24 animate-pulse" />
          ))
        ) : posts.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            Nothing saved yet. The bookmark mark on any raven places it here.
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}
