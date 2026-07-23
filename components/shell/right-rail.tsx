"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { createClient } from "@/lib/supabase/client";
import { houses } from "@/lib/data/houses";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { fetchViewer, fetchFollowingSet } from "@/lib/social/profile-queries";
import { fetchTopPeople, type PersonHit } from "@/lib/social/explore-queries";

interface HouseRow {
  slug: string;
  name: string;
  glory: number;
}

export function RightRail() {
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [lead, setLead] = useState<HouseRow | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  /* Who to follow: the realm's most renowned, with the viewer's real
     follow-state batched so every button loads truthfully in one query. */
  useEffect(() => {
    void fetchViewer().then((v) => {
      setViewerId(v?.id ?? null);
      void fetchTopPeople(v?.id).then((list) => {
        const top = list.slice(0, 4);
        setPeople(top);
        if (v?.id && top.length > 0) {
          void fetchFollowingSet(
            v.id,
            top.map((p) => p.id)
          ).then(setFollowingSet);
        }
      });
    });
  }, []);

  useEffect(() => {
    const db = createClient();
    void (async () => {
      const [{ data: posts }, { data: houseRows }, { data: season }] =
        await Promise.all([
          db
            .from("posts")
            .select("cashtags")
            .eq("deleted", false)
            .order("created_at", { ascending: false })
            .limit(200),
          db.from("houses").select("slug, name, glory").order("glory", {
            ascending: false,
          }),
          db.from("seasons").select("ends_at").eq("id", 1).maybeSingle(),
        ]);

      const counts = new Map<string, number>();
      for (const p of posts ?? [])
        for (const t of (p.cashtags as string[]) ?? [])
          counts.set(t, (counts.get(t) ?? 0) + 1);
      setTags(
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([tag, count]) => ({ tag, count }))
      );
      if (houseRows?.length) setLead(houseRows[0] as HouseRow);
      if (season?.ends_at) {
        const ms = new Date(season.ends_at).getTime() - Date.now();
        setDays(Math.max(0, Math.ceil(ms / 86_400_000)));
      }
      setReady(true);
    })();
  }, []);

  const leadMeta = houses.find((h) => h.slug === lead?.slug);

  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-4 px-4 py-6 xl:flex">
      <div className="glass p-4">
        <div className="flex items-center gap-2">
          <Icon name="raven" className="h-5 w-5 text-gold" />
          <h2 className="font-display text-base font-semibold tracking-wide text-bone">
            @raven
          </h2>
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-bone-faint">
            The Herald
          </span>
        </div>
        <p className="mt-2 text-sm text-bone-mut">
          Ask anything. Settle a debate, read a token, roast a friend kindly.
          Real data only, realm voice always.
        </p>
        <Link
          href="/raven"
          className="btn-glass mt-3 block w-full px-3 py-2 text-center text-sm text-bone-mut"
        >
          Summon the Raven
        </Link>
      </div>

      {/* Who to follow */}
      {(people === null || people.length > 0) && (
        <div className="glass p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold tracking-wide text-bone">
              Who to follow
            </h2>
            <Link
              href="/explore"
              className="text-xs text-gold hover:text-gold-bright"
            >
              More
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {people === null
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-panel" />
                ))
              : people.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <Link
                      href={`/u/${p.handle}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5"
                    >
                      <Avatar author={p} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-bone">
                          {p.display_name ?? p.handle}
                        </p>
                        <p className="truncate text-xs text-bone-faint">
                          @{p.handle}
                        </p>
                      </div>
                    </Link>
                    <FollowButton
                      targetId={p.id}
                      viewerId={viewerId}
                      initialFollowing={followingSet.has(p.id)}
                    />
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* The Season */}
      <div className="glass p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold tracking-wide text-bone">
            The Season
          </h2>
          {days !== null && (
            <span className="tnum text-xs text-gold">{days}d left</span>
          )}
        </div>
        {lead ? (
          <Link
            href={`/houses/${lead.slug}`}
            className="mt-3 flex items-center gap-3 rounded-xl bg-panel p-3 transition hover:bg-panel-warm"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(160deg, ${leadMeta?.color ?? "#C8A24C"}26, #101017)`,
                border: `1px solid ${leadMeta?.color ?? "#C8A24C"}55`,
                color: leadMeta?.color ?? "#C8A24C",
              }}
            >
              <Icon name="crown" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-bone">
                {lead.name}
              </p>
              <p className="tnum text-xs text-bone-faint">
                {lead.glory.toLocaleString()} Glory · leading
              </p>
            </div>
          </Link>
        ) : (
          <p className="mt-2 text-sm text-bone-mut">
            The Houses are still gathering. First to move claims the lead.
          </p>
        )}
        <Link
          href="/throne"
          className="mt-2 block text-center text-xs text-gold hover:text-gold-bright"
        >
          Enter Claim the Throne
        </Link>
      </div>

      {/* Trending cashtags */}
      <div className="glass p-4">
        <h2 className="font-display text-base font-semibold tracking-wide text-bone">
          What the realm watches
        </h2>
        {!ready ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-panel" />
            ))}
          </div>
        ) : tags.length ? (
          <div className="mt-3 flex flex-col gap-1.5">
            {tags.map((t) => (
              <Link
                key={t.tag}
                href={`/search?q=${encodeURIComponent(`$${t.tag}`)}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-panel"
              >
                <span className="font-semibold text-gold">${t.tag}</span>
                <span className="tnum text-xs text-bone-faint">
                  {t.count} {t.count === 1 ? "raven" : "ravens"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-bone-mut">
            No cashtags in the wind yet. Seal a Call and start the talk.
          </p>
        )}
      </div>
    </aside>
  );
}
