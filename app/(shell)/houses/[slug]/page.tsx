"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Meter } from "@/components/ui/meter";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Board,
  BoardCard,
  BoardStack,
  type BoardColumn,
} from "@/components/board/board-shell";
import {
  DossierHeader,
  DossierHero,
  DossierMissing,
  DossierPage,
  DossierSkeleton,
  DossierTabPanel,
  DossierTabs,
} from "@/components/dossier/dossier-shell";
import { Avatar } from "@/components/social/avatar";
import { PostCard } from "@/components/social/post-card";
import { fetchFeed } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { houseBySlug, houseIcon } from "@/lib/data/houses";
import { roleMeta } from "@/lib/houses/roles";
import type {
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
      <DossierMissing
        backHref="/houses"
        title="No such House"
        body="No House by that name holds a banner in this realm."
      />
    );

  if (showSkeleton)
    return <DossierSkeleton width="wide" panels={1} portrait={false} />;

  return (
    <DossierPage width="wide">
      <DossierHeader backHref="/houses" />

      {/* The hero is the one place a Dossier may carry the Forge register, and
          a House hall is where that is most obviously earned: the sigil in its
          own colour, the rank, the level and the rival. */}
      <DossierHero>
        <HouseBanner meta={meta} hall={hall} />
      </DossierHero>

      {/* Three genuinely different views of one subject, each with a count.
          That is the underline pattern by section 3, and it used to be a
          SegmentedControl, which says "two views of the same data". Picking
          the wrong tab pattern is a design bug, so this is the fix. */}
      <DossierTabs
        value={tab}
        onValueChange={(next) => setTab(next as Tab)}
        tabs={[
          {
            value: "board",
            label: "Contributors",
            count: hall?.board.length ?? 0,
          },
          { value: "roster", label: "Roster", count: hall?.roster.length ?? 0 },
          { value: "hall", label: "The hall", count: posts?.length ?? 0 },
        ]}
      >
        <DossierTabPanel value="board">
          <ContributorBoard hall={hall} />
        </DossierTabPanel>
        <DossierTabPanel value="roster">
          <Roster hall={hall} />
        </DossierTabPanel>
        <DossierTabPanel value="hall">
          <HallFeed posts={posts} />
        </DossierTabPanel>
      </DossierTabs>
    </DossierPage>
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
          icon3d="podium"
          title="Nobody is carrying the House yet"
          body="Contribution comes from Calls that resolve, duels won, and the realm's own rewards. The first member to earn any this season opens this board."
        />
      </Card>
    );

  const top = Math.max(1, ...board.map((b) => Math.max(0, b.contribution)));
  const cut = board.findIndex((b) => !b.counts);

  return (
    <BoardStack>
      <SectionHeader
        title="Carrying the House"
        hint={`Top ${topN} count toward the season score`}
      />
      <Board
        label="Members ranked by what they have contributed this season"
        rows={board}
        rowKey={(entry) => entry.profile_id}
        rowHref={(entry) =>
          entry.member?.handle ? `/u/${entry.member.handle}` : null
        }
        rowLabel={(entry) => `${memberName(entry.member)}, rank ${entry.rank}`}
        muted={(entry) => !entry.counts}
        /* The cut line is the whole point of this board: it is where a member
           stops counting toward the House score. It survives into the card
           list rather than being a desktop only rule. */
        divider={(_entry, i) =>
          cut > 0 && i === cut ? "Below the cut" : null
        }
        columns={[
          {
            key: "rank",
            header: "#",
            className: "w-10 whitespace-nowrap",
            cell: (entry) => (
              <span className="tnum text-bone-faint">{entry.rank}</span>
            ),
          },
          {
            key: "member",
            header: "Member",
            cell: (entry) => (
              <span className="flex items-center gap-2.5">
                <MemberAvatar member={entry.member} size={26} />
                <span className="truncate font-medium text-bone">
                  {memberName(entry.member)}
                </span>
              </span>
            ),
          },
          {
            key: "title",
            header: "Title",
            className: "whitespace-nowrap",
            cell: (entry) => <RoleLabel role={entry.role} />,
          },
          {
            key: "share",
            header: "Share",
            className: "w-28",
            cell: (entry) => (
              <Meter value={entry.contribution} max={top} size="xs" />
            ),
          },
          {
            key: "contribution",
            header: "Contributed",
            numeric: true,
            className: "whitespace-nowrap font-semibold text-gold",
            cell: (entry) => entry.contribution.toLocaleString(),
          },
        ]}
        card={(entry) => (
          <BoardCard
            {...(entry.member?.handle
              ? { href: `/u/${entry.member.handle}` }
              : {})}
            leading={
              <span className="flex items-center gap-2.5">
                <span className="tnum w-5 text-center text-xs text-bone-faint">
                  {entry.rank}
                </span>
                <MemberAvatar member={entry.member} size={32} />
              </span>
            }
            title={memberName(entry.member)}
            subtitle={<RoleLabel role={entry.role} />}
            trailing={
              <span className="block text-sm font-semibold text-gold">
                {entry.contribution.toLocaleString()}
              </span>
            }
          >
            <Meter value={entry.contribution} max={top} size="xs" className="mt-2.5" />
          </BoardCard>
        )}
      />
    </BoardStack>
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
          icon3d="banner"
          title="No one is sworn to this House"
          body="The banner is raised and waiting. The first oath sworn here starts the roster."
        />
      </Card>
    );

  return (
    <BoardStack>
      {titled.length > 0 ? (
        <>
          <SectionHeader title="Leadership" hint="Computed each season" />
          <p className="-mt-1 px-1 text-xs text-bone-mut">
            No elections. Every title is earned by what a member actually did
            this season, and all six rotate when the season turns.
          </p>
          <Board
            label="Members holding a title this season"
            rows={titled}
            rowKey={(entry) => entry.profile_id}
            rowHref={(entry) =>
              entry.member?.handle ? `/u/${entry.member.handle}` : null
            }
            rowLabel={(entry) =>
              `${memberName(entry.member)}, ${roleMeta(entry.role).title}`
            }
            columns={[
              MEMBER_COLUMN,
              {
                key: "title",
                header: "Title",
                className: "whitespace-nowrap",
                cell: (entry) => <RoleLabel role={entry.role} />,
              },
              {
                key: "earned",
                header: "Earned by",
                cell: (entry) => roleMeta(entry.role).earnedBy,
              },
              CONTRIBUTION_COLUMN,
            ]}
            card={(entry) => (
              <BoardCard
                {...(entry.member?.handle
                  ? { href: `/u/${entry.member.handle}` }
                  : {})}
                leading={<MemberAvatar member={entry.member} size={34} />}
                title={memberName(entry.member)}
                subtitle={<RoleLabel role={entry.role} />}
                trailing={<Contribution value={entry.contribution} />}
                stats={[
                  { label: "Earned by", value: roleMeta(entry.role).earnedBy },
                ]}
              />
            )}
          />
        </>
      ) : null}

      <SectionHeader title="Sworn" hint={`${sworn.length}`} />
      {sworn.length === 0 ? (
        <Card>
          <EmptyState
            size="sm"
            title="Every member holds a title"
            body="A small House where everyone is carrying something."
          />
        </Card>
      ) : (
        <Board
          label="Members sworn to this House"
          rows={sworn}
          rowKey={(entry) => entry.profile_id}
          rowHref={(entry) =>
            entry.member?.handle ? `/u/${entry.member.handle}` : null
          }
          rowLabel={(entry) => memberName(entry.member)}
          columns={[
            MEMBER_COLUMN,
            {
              key: "sworn",
              header: "Sworn",
              className: "whitespace-nowrap",
              cell: (entry) => swornOn(entry),
            },
            {
              key: "season",
              header: "Season",
              numeric: true,
              className: "whitespace-nowrap",
              cell: (entry) => entry.season_id ?? "",
            },
            CONTRIBUTION_COLUMN,
          ]}
          card={(entry) => (
            <BoardCard
              {...(entry.member?.handle
                ? { href: `/u/${entry.member.handle}` }
                : {})}
              leading={<MemberAvatar member={entry.member} size={34} />}
              title={memberName(entry.member)}
              subtitle={`Sworn ${swornOn(entry)}${
                entry.season_id ? ` · Season ${entry.season_id}` : ""
              }`}
              trailing={<Contribution value={entry.contribution} />}
            />
          )}
        />
      )}

      {past.length > 0 ? (
        <>
          <SectionHeader title="Once of this House" />
          <p className="-mt-1 px-1 text-xs text-bone-mut">
            They swore elsewhere, and everything they contributed here stayed
            here. It never follows a member out.
          </p>
          <Board
            label="Members who once swore to this House"
            rows={past}
            rowKey={(entry) => `${entry.profile_id}-${entry.left_at}`}
            rowHref={(entry) =>
              entry.member?.handle ? `/u/${entry.member.handle}` : null
            }
            rowLabel={(entry) => memberName(entry.member)}
            columns={[
              MEMBER_COLUMN,
              {
                key: "span",
                header: "Held the banner",
                className: "whitespace-nowrap",
                cell: (entry) => entry.span,
              },
            ]}
            card={(entry) => (
              <BoardCard
                {...(entry.member?.handle
                  ? { href: `/u/${entry.member.handle}` }
                  : {})}
                leading={<MemberAvatar member={entry.member} size={32} />}
                title={memberName(entry.member)}
                subtitle={entry.span}
              />
            )}
          />
        </>
      ) : null}
    </BoardStack>
  );
}

/* ------------------------------------------------------------------
   The pieces every roster board shares
   ------------------------------------------------------------------ */

function memberName(member: MemberIdentityView | null): string {
  if (!member?.handle) return "A member of the realm";
  return member.display_name ?? `@${member.handle}`;
}

function MemberAvatar({
  member,
  size,
}: {
  member: MemberIdentityView | null;
  size: number;
}) {
  return (
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
}

function RoleLabel({ role }: { role: string }) {
  if (role === "sworn") return <span className="text-bone-faint">Sworn</span>;
  const meta = roleMeta(role);
  return (
    <span className="flex items-center gap-1 font-semibold text-gold">
      <Icon name={meta.icon} className="h-3 w-3 shrink-0" />
      {meta.title}
    </span>
  );
}

function Contribution({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="tnum font-semibold text-gold">
        {value.toLocaleString()}
      </span>
    );
  return <span className="text-bone-faint">none yet</span>;
}

function swornOn(entry: RosterEntryView): string {
  return new Date(entry.sworn_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/* The identity cell, identical on every roster board. */
const MEMBER_COLUMN: BoardColumn<{ member: MemberIdentityView | null }> = {
  key: "member",
  header: "Member",
  cell: (entry) => (
    <span className="flex items-center gap-2.5">
      <MemberAvatar member={entry.member} size={26} />
      <span className="truncate font-medium text-bone">
        {memberName(entry.member)}
      </span>
    </span>
  ),
};

const CONTRIBUTION_COLUMN: BoardColumn<{ contribution: number }> = {
  key: "contribution",
  header: "Contributed",
  numeric: true,
  className: "whitespace-nowrap",
  cell: (entry) => <Contribution value={entry.contribution} />,
};

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
          icon3d="house-hall"
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
