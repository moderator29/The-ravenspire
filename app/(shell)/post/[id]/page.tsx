"use client";

import { use, useEffect, useState } from "react";
import { PostCard } from "@/components/social/post-card";
import { CommentThread } from "@/components/social/comment-thread";
import { fetchPost } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { realmFetch } from "@/lib/auth/api";

export default function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [post, setPost] = useState<Post | null | "loading">("loading");

  useEffect(() => {
    void fetchPost(id).then(setPost);
    /* A real view, counted once per member per day, server-side. */
    void realmFetch("/api/views", { method: "POST", json: { post_id: id } });
  }, [id]);

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton href="/home" label="Back to the Ravenry" />
      </div>
      {post === "loading" ? (
        <div className="glass glass-sm h-32 animate-pulse" />
      ) : post === null ? (
        <div className="glass p-8 text-center text-sm text-bone-mut">
          This raven flew beyond the realm, or never was.
        </div>
      ) : (
        <>
          <PostCard post={post} />
          {post.view_count > 0 && (
            <p className="tnum mt-2 flex items-center gap-1.5 px-2 text-xs text-bone-faint">
              <Icon name="eye" className="h-3.5 w-3.5" />
              {post.view_count.toLocaleString()} views
            </p>
          )}
          <div className="mt-6 flex items-center gap-3 px-1">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/25" />
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
              <Icon name="reply" className="h-3.5 w-3.5" />
              The Thread
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/25" />
          </div>
          <CommentThread postId={post.id} />
        </>
      )}
    </div>
  );
}
