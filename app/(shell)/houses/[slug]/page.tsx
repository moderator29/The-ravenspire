"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/shell/back-button";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Avatar } from "@/components/social/avatar";
import { PostCard } from "@/components/social/post-card";
import { fetchFeed } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { houseBySlug, houseIcon } from "@/lib/data/houses";
import { roleMeta } from "@/lib/houses/roles";
import type {
  BoardEntry,
  HouseHall,
  MemberIdentityView,
  RosterEntryView,
} from "@/lib/houses/view";
import { seasonCountdown } from "@/lib/houses/view";

/* One House hall.
 *
 * The old page showed two numbers off the houses table and a feed. This is the
 * roster, the seasonal titles, the live contributor board, the named rival,
 * the House level and the members who once held the banner.
 *
 * The board is the centrepiece. "Who is carrying our House right now" is a
 * named, churning, public list, and it is the single strongest signal that a
 * House is a place rather than a label on a profile. */

type Tab = "board" | "roster" | "hall";

export default function HousePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  /* Keyed on the slug so walking from one hall to the next remounts with fresh
     state, rather than showing the previous House's roster while the new one
     loads. */
  return <HouseHallView key={slug} slug={slug} />;
}

function HouseHallView({ slug }: { slug: string }) {
  const meta = houseBySlug(slug);

  const [hall, setHall] = useState<HouseHall | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const showSkeleton = useDelayedLoading(loading);

  useEffect(() => {
    let live = true;
    void fetch(`/api/houses/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: HouseHall | null) => {
        if (!live) return;
        setHall(payload);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));

    /* The hall feed reads through /api/feed, which resolves the viewer from
       the bearer token server-side. That is what makes a member's own
       house-visibility ravens visible in their own House hall; the old client
       side filter had no viewer and silently dropped them. */
    void fetchFeed({ tab: "houses", houseSlug: slug }).then(
      (rows) => live && setPosts(rows)
    );
    return () => {
      live = false;
    };
  }, [slug]);

  if (!meta)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex justify-center">
          <BackButton href="/houses" />
        </div>
        <p className="text-sm text-bone-mut">
          No such House holds a banner in this realm.
        </p>
      </div>
    );

  if (showSkeleton)
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
        <Skeleton radius="xl" className="h-44 w-full" />
        <Skeleton radius="xl" className="mt-4 h-72 w-full" />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-3">
        <BackButton href="/houses" />
      </div>

      <HouseBanner meta={meta} hall={hall} />

      <div className="mt-4">
        <SegmentedControl
          block
          label="House hall view"
          value={tab}
          onValueChange={(next) => setTab(next as Tab)}
          items={[
            { value: "board", label: "Contributors" },
            { value: "roster", label: "Roster" },
            { value: "hall", label: "The hall" },
          ]}
        />
      </div>

      <div className="mt-4">
        {tab === "board" ? (
          <ContributorBoard hall={hall} />
        ) : tab === "roster" ? (
          <Roster hall={hall} />
        ) : (
          <HallFeed posts={posts} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Banner
   ------------------------------------------------------------------ */

function HouseBanner({
  meta,
  hall,
}: {
  meta: NonNullable<ReturnType<typeof houseBySlug>>;
  hall: HouseHall | null;
}) {
  const standing = hall?.standing;
  const level = hall?.level;

  return (
    <Card
      variant="warm"
      pad="lg"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255, 233, 163,0.1), 0 18px 50px rgba(0,0,0,0.45), 0 0 44px ${meta.color}14`,
      }}
    >
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg sm:h-14 sm:w-14"
          style={{
            background: `linear-gradient(160deg, ${meta.color}26, #101017)`,
            border: `1px solid ${meta.color}55`,
            color: meta.color,
          }}
        >
          <Icon name={houseIcon(meta.slug)} className="h-6 w-6 sm:h-7 sm:w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
              {meta.name}
            </h1>
            {standing ? (
              <Badge variant="gold">Rank {standing.rank}</Badge>
            ) : null}
            {level ? <Badge variant="default">Level {level.level}</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm italic text-gold/80">{meta.motto}</p>
        </div>
      </div>

      <p className="mt-3 max-w-prose text-sm leading-relaxed text-bone-mut">
        {meta.desc}
      </p>

      {standing ? (
        <>
          <dl className="tnum mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label={`Top ${standing.top_n} score`}
              value={standing.score.toLocaleString()}
              tone="gold"
            />
            <Stat
              label="Counting"
              value={`${standing.counted} of ${standing.member_count}`}
            />
            <Stat
              label="Contributed"
              value={standing.contributor_count.toLocaleString()}
            />
            <Stat label="Mean of the counted" value={standing.mean.toLocaleString()} />
          </dl>

          {/* House progression, cumulative and never reset. A House that
              carried Season 1 keeps that standing through a quiet Season 4. */}
          {level ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-bone-mut">
                  House level {level.level}
                </span>
                <span className="tnum text-bone-faint">
                  {(level.cumulative ?? 0).toLocaleString()} /{" "}
                  {level.next.toLocaleString()} all-time
                </span>
              </div>
              <div className="bar-track mt-1.5 h-1.5 w-full">
                <div
                  className="bar-gold h-full"
                  style={{ width: `${Math.max(2, level.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {hall?.rival ? (
            <Link
              href={`/houses/${hall.rival.slug}`}
              className="mt-4 flex items-center gap-2 rounded-md border border-steel-line bg-obsidian/60 px-3 py-2.5 text-xs text-bone-mut transition-colors duration-fast hover:border-gold/40 hover:text-bone"
            >
              <Icon name="swords" className="h-4 w-4 shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                {hall.rival.ahead ? "Holding off " : "Chasing "}
                <b className="font-semibold text-bone">{hall.rival.name}</b>
                {", "}
                <span className="tnum">{hall.rival.gap.toLocaleString()}</span>{" "}
                {hall.rival.ahead ? "ahead" : "behind"}
              </span>
              <Icon name="arrow" className="h-3.5 w-3.5 shrink-0" />
            </Link>
          ) : null}

          {hall?.season ? (
            <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              {hall.season.name} · {seasonCountdown(hall.season.ends_at)}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone-faint">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-display text-lg font-semibold ${
          tone === "gold" ? "text-gold" : "text-bone"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------
   The live contributor board
   ------------------------------------------------------------------ */

function ContributorBoard({ hall }: { hall: HouseHall | null }) {
  const board = hall?.board ?? [];
  const topN = hall?.standing.top_n ?? 20;

  if (board.length === 0)
    return (
      <Card>
        <EmptyState
          icon="medal"
          title="Nobody is carrying the House yet"
          body="Contribution comes from Calls that resolve, duels won, and the realm's own rewards. The first member to earn any this season opens this board."
        />
      </Card>
    );

  const top = Math.max(1, ...board.map((b) => Math.max(0, b.contribution)));
  const cut = board.findIndex((b) => !b.counts);

  return (
    <Card pad="none">
      <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
        <Icon name="medal" className="h-4 w-4 shrink-0 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Carrying the House
        </h2>
        <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-bone-faint">
          Top {topN} count
        </span>
      </div>
      <ol className="flex flex-col px-4 py-3 sm:px-5">
        {board.map((entry, i) => (
          <li key={entry.profile_id}>
            {i === cut && cut > 0 ? (
              <div className="my-2 flex items-center gap-2">
                <span className="h-px flex-1 bg-steel-line" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                  Below the cut
                </span>
                <span className="h-px flex-1 bg-steel-line" />
              </div>
            ) : null}
            <BoardRow entry={entry} top={top} />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function BoardRow({ entry, top }: { entry: BoardEntry; top: number }) {
  const role = roleMeta(entry.role);
  return (
    <div
      className={`flex items-center gap-3 border-t border-steel-line py-2.5 first:border-t-0 ${
        entry.counts ? "" : "opacity-60"
      }`}
    >
      <span className="tnum w-5 shrink-0 text-center text-xs text-bone-faint">
        {entry.rank}
      </span>
      <MemberLink member={entry.member} size={30} role={entry.role} />
      <div className="min-w-0 flex-1">
        <MemberName member={entry.member} />
        {entry.role !== "sworn" ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gold">
            <Icon name={role.icon} className="h-3 w-3" />
            {role.title}
          </p>
        ) : null}
        <div className="bar-track mt-1.5 h-1 w-full">
          <div
            className="bar-gold h-full"
            style={{
              width: `${Math.max(2, (Math.max(0, entry.contribution) / top) * 100)}%`,
            }}
          />
        </div>
      </div>
      <span className="tnum shrink-0 text-sm font-semibold text-gold">
        {entry.contribution.toLocaleString()}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Roster and past members
   ------------------------------------------------------------------ */

function Roster({ hall }: { hall: HouseHall | null }) {
  const roster = hall?.roster ?? [];
  const titled = roster.filter((r) => r.role !== "sworn");
  const sworn = roster.filter((r) => r.role === "sworn");
  const past = hall?.past ?? [];

  if (roster.length === 0 && past.length === 0)
    return (
      <Card>
        <EmptyState
          icon="banner"
          title="No one is sworn to this House"
          body="The banner is raised and waiting. The first oath sworn here starts the roster."
        />
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      {titled.length > 0 ? (
        <Card pad="none">
          <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
            <Icon name="crown" className="h-4 w-4 shrink-0 text-gold" />
            <h2 className="font-display text-base font-semibold text-bone">
              Leadership
            </h2>
            <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-bone-faint">
              Computed each season
            </span>
          </div>
          <p className="px-4 pt-1.5 text-xs text-bone-mut sm:px-5">
            No elections. Every title is earned by what a member actually did
            this season, and all six rotate when the season turns.
          </p>
          <ul className="flex flex-col px-4 py-3 sm:px-5">
            {titled.map((entry) => (
              <li key={entry.profile_id}>
                <RosterRow entry={entry} showEarnedBy />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card pad="none">
        <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
          <Icon name="shield" className="h-4 w-4 shrink-0 text-gold" />
          <h2 className="font-display text-base font-semibold text-bone">
            Sworn
          </h2>
          <span className="tnum ml-auto text-[11px] text-bone-faint">
            {sworn.length}
          </span>
        </div>
        {sworn.length === 0 ? (
          <EmptyState
            size="sm"
            title="Every member holds a title"
            body="A small House where everyone is carrying something."
          />
        ) : (
          <ul className="flex flex-col px-4 py-3 sm:px-5">
            {sworn.map((entry) => (
              <li key={entry.profile_id}>
                <RosterRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {past.length > 0 ? (
        <Card pad="none">
          <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
            <Icon name="scroll" className="h-4 w-4 shrink-0 text-gold" />
            <h2 className="font-display text-base font-semibold text-bone">
              Once of this House
            </h2>
          </div>
          <p className="px-4 pt-1.5 text-xs text-bone-mut sm:px-5">
            They swore elsewhere, and everything they contributed here stayed
            here. It never follows a member out.
          </p>
          <ul className="flex flex-col px-4 py-3 sm:px-5">
            {past.map((entry) => (
              <li
                key={`${entry.profile_id}-${entry.left_at}`}
                className="flex items-center gap-3 border-t border-steel-line py-2.5 first:border-t-0"
              >
                <MemberLink member={entry.member} size={28} />
                <div className="min-w-0 flex-1">
                  <MemberName member={entry.member} />
                  <p className="mt-0.5 text-[11px] text-bone-faint">
                    {entry.span}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function RosterRow({
  entry,
  showEarnedBy,
}: {
  entry: RosterEntryView;
  showEarnedBy?: boolean;
}) {
  const role = roleMeta(entry.role);
  return (
    <div className="flex items-center gap-3 border-t border-steel-line py-2.5 first:border-t-0">
      <MemberLink member={entry.member} size={32} role={entry.role} />
      <div className="min-w-0 flex-1">
        <MemberName member={entry.member} />
        {entry.role !== "sworn" ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-gold">
            <Icon name={role.icon} className="h-3 w-3" />
            {role.title}
            {showEarnedBy ? (
              <span className="font-normal text-bone-faint">
                {" · "}
                {role.earnedBy}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-bone-faint">
            Sworn{" "}
            {new Date(entry.sworn_at).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}
            {entry.season_id ? ` · Season ${entry.season_id}` : ""}
          </p>
        )}
      </div>
      <span className="tnum shrink-0 text-xs text-bone-mut">
        {entry.contribution > 0 ? (
          <b className="text-gold">{entry.contribution.toLocaleString()}</b>
        ) : (
          <span className="text-bone-faint">no contribution yet</span>
        )}
      </span>
    </div>
  );
}

function MemberLink({
  member,
  size,
  role,
}: {
  member: MemberIdentityView | null;
  size: number;
  role?: string;
}) {
  const avatar = (
    <Avatar
      author={{
        handle: member?.handle ?? null,
        display_name: member?.display_name ?? null,
        avatar_url: member?.avatar_url ?? null,
        house_slug: member?.house_slug ?? null,
      }}
      size={size}
    />
  );
  if (!member?.handle) return avatar;
  return (
    <Link
      href={`/u/${member.handle}`}
      aria-label={`${member.display_name ?? member.handle}${
        role && role !== "sworn" ? `, ${roleMeta(role).title}` : ""
      }`}
      className="shrink-0"
    >
      {avatar}
    </Link>
  );
}

function MemberName({ member }: { member: MemberIdentityView | null }) {
  if (!member?.handle)
    return <p className="truncate text-sm text-bone-mut">A member of the realm</p>;
  return (
    <Link
      href={`/u/${member.handle}`}
      className="block truncate text-sm font-semibold text-bone hover:text-gold"
    >
      {member.display_name ?? `@${member.handle}`}
    </Link>
  );
}

/* ------------------------------------------------------------------
   The hall feed
   ------------------------------------------------------------------ */

function HallFeed({ posts }: { posts: Post[] | null }) {
  if (posts === null)
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} radius="xl" className="h-32 w-full" />
        ))}
      </div>
    );

  if (posts.length === 0)
    return (
      <Card>
        <EmptyState
          icon="raven"
          title="The hall is quiet"
          body="Ravens from sworn members gather here, including the ones sent to the House alone."
        />
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
