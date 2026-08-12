"use client";

import { use, useEffect, useState } from "react";
import { PostCard } from "@/components/social/post-card";
import { CommentThread } from "@/components/social/comment-thread";
import { fetchPost } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DossierDivider,
  DossierHeader,
  DossierHero,
  DossierMissing,
  DossierPage,
} from "@/components/dossier/dossier-shell";
import { realmFetch } from "@/lib/auth/api";

/* A raven and its thread, on the Dossier archetype.

   Post detail is a subject with a hero and a panel under it, which is a
   Dossier with one section rather than a Stream: the raven is not one card in
   a list, it is the thing the page is about. It had no shell at all, so the
   column width, the back control and the loading state were three more
   one offs. The thread stays a Stream inside the panel, which is what a
   thread is. */

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

  if (post === null)
    return (
      <DossierMissing
        backHref="/home"
        title="No such raven"
        body="This raven flew beyond the realm, or never was."
      />
    );

  return (
    <DossierPage>
      <DossierHeader backHref="/home" backLabel="Back to the Ravenry" />

      {post === "loading" ? (
        <>
          <Skeleton radius="xl" className="h-32 w-full" />
          <Skeleton radius="xl" className="mt-6 h-24 w-full" />
        </>
      ) : (
        <>
          <DossierHero>
            <PostCard post={post} />
            {post.view_count > 0 && (
              <p className="tnum mt-2 flex items-center gap-1.5 px-2 text-xs text-bone-faint">
                <Icon name="eye" className="h-3.5 w-3.5" />
                {post.view_count.toLocaleString()} views
              </p>
            )}
          </DossierHero>

          <DossierDivider icon="reply">The Thread</DossierDivider>
          <CommentThread postId={post.id} />
        </>
      )}
    </DossierPage>
  );
}
