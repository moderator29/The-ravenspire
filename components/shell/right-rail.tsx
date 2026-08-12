"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { createClient } from "@/lib/supabase/client";
import { houses } from "@/lib/data/houses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { fetchViewer, fetchFollowingSet } from "@/lib/social/profile-queries";
import { fetchTopPeople, type PersonHit } from "@/lib/social/explore-queries";

/* A promise that never settles is not caught by a `catch`.
 *
 * Both cards below already fall to an honest empty state when a fetch rejects.
 * Neither had anything to say about a fetch that simply never answers, and that
 * is not a hypothetical: a request that hangs on a dead connection or a stalled
 * socket resolves nothing, rejects nothing, and leaves a skeleton pulsing for
 * as long as the member stays on the page. Measured on a build with no realm
 * reachable, four seconds after the network had gone quiet: three grey bars in
 * "Who to follow" and three more in "What the realm watches", on every screen
 * in the product, forever.
 *
 * A skeleton is a claim that something is arriving. This puts a deadline on the
 * claim. Six seconds is well past any honest load and well short of the point
 * where a member has decided the product is broken. */
const SETTLE_MS = 6000;

/* Rejects rather than resolving a stand in, so a hang lands in the same
   `catch` a failure already lands in. One path to the empty state, not two. */
function withDeadline<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("deadline")), SETTLE_MS)
    ),
  ]);
}

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
     follow-state batched so every button loads truthfully in one query.

     The catch is the load bearing part. A rejected fetch used to leave `people`
     null forever, and null is what draws the skeleton, so a member on a flaky
     connection got three grey bars pulsing on every screen in the realm for as
     long as they stayed. A skeleton is a claim that something is arriving. When
     nothing is arriving that claim is false, and both of these cards already
     have an honest empty state to fall to. */
  useEffect(() => {
    void (async () => {
      try {
        const viewer = await withDeadline(fetchViewer());
        setViewerId(viewer?.id ?? null);
        const top = (await withDeadline(fetchTopPeople(viewer?.id))).slice(0, 4);
        setPeople(top);
        if (viewer?.id && top.length > 0) {
          setFollowingSet(
            await fetchFollowingSet(
              viewer.id,
              top.map((p) => p.id)
            )
          );
        }
      } catch {
        /* No suggestions rather than a promise of suggestions. */
        setPeople([]);
      }
    })();
  }, []);

  useEffect(() => {
    const db = createClient();
    void (async () => {
      try {
        const [{ data: posts }, { data: houseRows }, { data: season }] =
          await withDeadline(
            Promise.all([
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
            ])
          );

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
      } catch {
        /* Fall through to the empty state below rather than pulse forever. */
      } finally {
        /* Settled either way: `ready` means the realm has answered, not that
           the answer was good news. */
        setReady(true);
      }
    })();
  }, []);

  const leadMeta = houses.find((h) => h.slug === lead?.slug);

  return (
    <aside className="hidden w-80 shrink-0 flex-col gap-4 px-4 py-6 xl:flex">
      <Card pad="md">
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
        <Button
          variant="glass"
          size="md"
          block
          className="mt-3"
          render={<Link href="/raven" />}
        >
          Summon the Raven
        </Button>
      </Card>

      {/* Who to follow */}
      {(people === null || people.length > 0) && (
        <Card pad="md">
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
                  <Skeleton key={i} className="h-10 w-full" />
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
        </Card>
      )}

      {/* The Season */}
      <Card pad="md">
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
                background: `linear-gradient(160deg, ${leadMeta?.color ?? "#D9B040"}26, #101017)`,
                border: `1px solid ${leadMeta?.color ?? "#D9B040"}55`,
                color: leadMeta?.color ?? "#D9B040",
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
      </Card>

      {/* Trending cashtags */}
      <Card pad="md">
        <h2 className="font-display text-base font-semibold tracking-wide text-bone">
          What the realm watches
        </h2>
        {!ready ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
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
      </Card>
    </aside>
  );
}
