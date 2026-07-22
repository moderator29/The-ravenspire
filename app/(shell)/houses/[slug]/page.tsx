"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BackButton } from "@/components/shell/back-button";
import { houses as houseData } from "@/lib/data/houses";
import { PostCard } from "@/components/social/post-card";
import { fetchFeed } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { Icon } from "@/components/ui/icon";

export default function HousePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const meta = houseData.find((h) => h.slug === slug);
  const [stats, setStats] = useState<{ member_count: number; glory: number }>();
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    const db = createClient();
    void db
      .from("houses")
      .select("member_count, glory")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => data && setStats(data));
    void fetchFeed({ tab: "houses", houseSlug: slug }).then(setPosts);
  }, [slug]);

  if (!meta)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-bone-mut">
        No such House holds a banner in this realm.
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-3">
        <BackButton href="/houses" />
      </div>
      <div
        className="glass p-6"
        style={{ boxShadow: `inset 0 1px 0 rgba(240,214,140,0.1), 0 18px 50px rgba(0,0,0,0.45), 0 0 44px ${meta.color}14` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: `linear-gradient(160deg, ${meta.color}26, #101017)`,
              border: `1px solid ${meta.color}55`,
              color: meta.color,
            }}
          >
            <Icon name="banner" className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-bone">
              {meta.name}
            </h1>
            <p className="text-sm italic text-gold/80">{meta.motto}</p>
          </div>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-bone-mut">
          {meta.desc}
        </p>
        <div className="tnum mt-4 flex gap-6 text-sm">
          <span>
            <b className="text-gold">{(stats?.glory ?? 0).toLocaleString()}</b>{" "}
            <span className="text-bone-faint">Glory</span>
          </span>
          <span>
            <b className="text-bone">
              {(stats?.member_count ?? 0).toLocaleString()}
            </b>{" "}
            <span className="text-bone-faint">sworn members</span>
          </span>
        </div>
      </div>

      <h2 className="mt-6 mb-3 font-display text-lg font-semibold text-bone">
        The House hall
      </h2>
      <div className="flex flex-col gap-3">
        {posts.length === 0 ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            The hall is quiet. Ravens from sworn members gather here.
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}
