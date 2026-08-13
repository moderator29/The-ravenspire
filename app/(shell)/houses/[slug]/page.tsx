"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ShareButton } from "@/components/share/share-button";
import { PostCard } from "@/components/social/post-card";
import { realmFetch } from "@/lib/auth/api";
import { fetchFeed } from "@/lib/social/queries";
import type { Post } from "@/lib/social/types";
import { houseBySlug, houseIcon } from "@/lib/data/houses";
import { roleMeta } from "@/lib/houses/roles";
import type {
  HouseHall,
  HouseTreasuryView,
  MemberIdentityView,
  PerkOfferView,
  RosterEntryView,
  TreasuryEntryView,
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

type Tab = "board" | "roster" | "treasury" | "hall";

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

  /* The hall read, as a callback rather than an inline effect, because buying
     a perk changes the treasury, the catalogue and the ledger at once and the
     honest way to show that is to ask the server again rather than to patch
     three numbers on the client and hope they match. */
  const loadHall = useCallback(async (): Promise<HouseHall | null> => {
    const res = await realmFetch<HouseHall>(
      `/api/houses/${encodeURIComponent(slug)}`
    );
    return res.ok ? (res.data ?? null) : null;
  }, [slug]);

  useEffect(() => {
    let live = true;
    void loadHall()
      .then((payload) => {
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
  }, [slug, loadHall]);

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
      <DossierHeader
        backHref="/houses"
        /* No subjectHandle: a House belongs to everybody sworn to it, so there
           is no member whose banner could honestly ride on a link to it. The
           control is here because a House arguing about its own standing in a
           group chat is the realm's cheapest recruitment, and until now there
           was no way to link the argument. */
        actions={<ShareButton target={{ kind: "house", slug }} title={`${meta.name} · The Ravenspire`} />}
      />

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
          {
            value: "treasury",
            label: "Treasury",
            count: hall?.treasury.active.length ?? 0,
          },
          { value: "hall", label: "The hall", count: posts?.length ?? 0 },
        ]}
      >
        <DossierTabPanel value="board">
          <ContributorBoard hall={hall} />
        </DossierTabPanel>
        <DossierTabPanel value="roster">
          <Roster hall={hall} />
        </DossierTabPanel>
        <DossierTabPanel value="treasury">
          <Treasury
            slug={slug}
            treasury={hall?.treasury ?? null}
            onSpent={() => void loadHall().then((next) => next && setHall(next))}
          />
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
              carried Season 1 keeps that standing through a quiet Season 4.

              The bar and the figure beside it used to describe two different
              things. `progress` is measured inside the current level, from its
              floor to the next rung, while the caption read "12,000 / 14,000
              all-time", which any reader takes as a fraction: the bar drew 43%
              under a number that said 86%. Both now report the same span, the
              one the level is actually about, and the bar is the Meter
              primitive rather than a tenth hand rolled copy of it. */}
          {level ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-bone-mut">
                  House level {level.level}
                </span>
                <span className="tnum text-bone-faint">
                  {Math.max(
                    0,
                    (level.cumulative ?? 0) - level.floor
                  ).toLocaleString()}{" "}
                  / {Math.max(1, level.next - level.floor).toLocaleString()} to
                  level {level.level + 1}
                </span>
              </div>
              <Meter
                value={(level.cumulative ?? 0) - level.floor}
                max={level.next - level.floor}
                className="mt-1.5"
              />
            </div>
          ) : null}

          {/* The rival is a control, so it takes the control primitive. Hand
              written it was a 38px row, three pixels of padding short of the
              44px floor a finger needs, and it carried none of the chassis
              elevation: rule 18 and the touch floor answered by the same
              change rather than by a bespoke height. */}
          {hall?.rival ? (
            <Button
              variant="glass"
              size="lg"
              pad="sm"
              block
              render={<Link href={`/houses/${hall.rival.slug}`} />}
              className="mt-4 justify-start text-xs font-normal text-bone-mut"
            >
              <Icon name="swords" className="h-4 w-4 shrink-0 text-gold" />
              <span className="min-w-0 flex-1 truncate text-left">
                {hall.rival.ahead ? "Holding off " : "Chasing "}
                <b className="font-semibold text-bone">{hall.rival.name}</b>
                {", "}
                <span className="tnum">{hall.rival.gap.toLocaleString()}</span>{" "}
                {hall.rival.ahead ? "ahead" : "behind"}
              </span>
              <Icon name="arrow" className="h-3.5 w-3.5 shrink-0" />
            </Button>
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
   The treasury
   ------------------------------------------------------------------ */

/* What a House holds, what it has bought, and every movement of both.
 *
 * Ledger register throughout, deliberately. A treasury is an instrument: a
 * balance, a price list and an audit trail. The Forge belongs to the moment a
 * House wins something, not to the page where it does its accounts.
 *
 * Real data or an honest zero. No House has a treasury on the day this ships,
 * so the first thing almost every reader will see is a balance of zero and a
 * sentence explaining where the money comes from. That is the correct first
 * impression and it is never dressed up as anything else.
 *
 * Responsive by layout rather than by scale: the catalogue is a two column
 * grid of cards on a wide screen and a single column below, and the movements
 * list is a table above md and a card list under it, which is what the Board
 * primitive already does.
 */
function Treasury({
  slug,
  treasury,
  onSpent,
}: {
  slug: string;
  treasury: HouseTreasuryView | null;
  onSpent: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!treasury)
    return (
      <Card>
        <EmptyState
          title="The coffers cannot be read"
          body="The realm could not reach this House's treasury just now."
        />
      </Card>
    );

  const buy = async (perk: string) => {
    if (busy) return;
    setBusy(perk);
    setError(null);
    const res = await realmFetch<{ error?: string }>(
      `/api/houses/${encodeURIComponent(slug)}/treasury`,
      { method: "POST", json: { perk } }
    );
    setBusy(null);
    if (!res.ok) {
      setError(res.data?.error ?? "The treasury would not open.");
      return;
    }
    onSpent();
  };

  return (
    <BoardStack>
      <Card variant="warm" pad="lg">
        <p className="text-[10px] uppercase tracking-[0.18em] text-bone-faint">
          House treasury
        </p>
        <p className="tnum mt-1 font-display text-3xl font-semibold text-gold">
          {treasury.balance.toLocaleString()}
          <span className="ml-2 align-middle text-xs font-normal uppercase tracking-[0.16em] text-bone-faint">
            points
          </span>
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-bone-mut">
          {treasury.balance > 0
            ? "Every point here came from a Call that went wrong. Half of a burned stake leaves the realm and half pools under the banner."
            : "Nothing yet. A treasury fills when a sworn member stakes POINTS on a Call and the Call misses: half of the burn leaves the realm for good, and half pools here."}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-bone-faint">
          The Lord and the Hand of the House may spend it. Both titles are
          earned by contribution and turn over when the season does, so nobody
          holds the keys for long. Every movement is listed below.
        </p>
      </Card>

      {treasury.active.length > 0 ? (
        <>
          <SectionHeader title="Burning now" />
          <div className="grid gap-3 lg:grid-cols-2">
            {treasury.active.map((perk) => {
              const offer = treasury.catalogue.find((c) => c.slug === perk.slug);
              return (
                <Card key={`${perk.slug}-${perk.starts_at}`} tone="gold">
                  <div className="flex items-start gap-2.5">
                    <Icon
                      name={offer?.icon ?? "shield"}
                      className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-bone">
                        {offer?.name ?? perk.slug}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-bone-mut">
                        {offer?.effect ?? ""}
                      </p>
                      <p className="tnum mt-2 text-[11px] text-bone-faint">
                        {expiryLine(perk.expires_at)}
                        {perk.allowance_remaining !== null
                          ? ` · ${perk.allowance_remaining.toLocaleString()} POINTS left in the pot`
                          : ""}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      <SectionHeader
        title="What a treasury buys"
        hint={`Priced per sworn member (${treasury.sworn})`}
      />
      <p className="-mt-1 px-1 text-xs leading-relaxed text-bone-mut">
        Every perk is priced by headcount. A House with sixty members burns
        roughly three times the stakes a House with twenty does, so a flat price
        would hand the big House three perks for every one the small House
        could afford, and the size-neutral scoring would quietly stop being
        size neutral.
      </p>

      {error ? (
        <p role="alert" className="px-1 text-xs text-state-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {treasury.catalogue.map((offer) => (
          <PerkCard
            key={offer.slug}
            offer={offer}
            maySpend={treasury.may_spend}
            busy={busy === offer.slug}
            onBuy={() => void buy(offer.slug)}
          />
        ))}
      </div>

      <SectionHeader title="Movements" hint="Every point in and every point out" />
      {treasury.ledger.length === 0 ? (
        <Card>
          <EmptyState
            size="sm"
            title="The treasury has never moved"
            body="The first staked Call to miss under this banner opens the ledger."
          />
        </Card>
      ) : (
        <Board
          label="Every movement of this House's treasury"
          rows={treasury.ledger}
          rowKey={(entry) => `${entry.created_at}-${entry.reason}-${entry.delta}`}
          columns={[
            {
              key: "when",
              header: "When",
              className: "w-32 whitespace-nowrap",
              cell: (entry) => (
                <span className="text-bone-faint">{movedOn(entry)}</span>
              ),
            },
            {
              key: "reason",
              header: "Movement",
              cell: (entry) => (
                <span className="text-bone">{movementLabel(entry.reason)}</span>
              ),
            },
            {
              key: "delta",
              header: "Points",
              numeric: true,
              className: "whitespace-nowrap font-semibold",
              cell: (entry) => <Delta value={entry.delta} />,
            },
          ]}
          card={(entry) => (
            <BoardCard
              title={movementLabel(entry.reason)}
              subtitle={movedOn(entry)}
              trailing={<Delta value={entry.delta} />}
            />
          )}
        />
      )}
    </BoardStack>
  );
}

function PerkCard({
  offer,
  maySpend,
  busy,
  onBuy,
}: {
  offer: PerkOfferView;
  maySpend: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  /* One reason, the most useful one, rather than a stack of disabled states.
     A member who cannot buy is told why in the same place the price is. */
  const blocked = offer.burning
    ? "Already burning"
    : !maySpend
      ? "Only the Lord and the Hand may spend"
      : !offer.affordable
        ? "The treasury cannot cover this yet"
        : null;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <Icon name={offer.icon} className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-bone">
            {offer.name}
          </p>
          <p className="mt-0.5 text-xs italic text-gold/80">{offer.blurb}</p>
        </div>
        <span className="tnum shrink-0 text-sm font-semibold text-gold">
          {offer.price.toLocaleString()}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-bone-mut">{offer.effect}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="gold"
          size="md"
          onClick={onBuy}
          loading={busy}
          disabled={busy || blocked !== null}
        >
          {busy ? "Opening" : `Spend ${offer.price.toLocaleString()} POINTS`}
        </Button>
        {blocked ? (
          <span className="text-[11px] text-bone-faint">{blocked}</span>
        ) : (
          <span className="tnum text-[11px] text-bone-faint">
            Burns for {offer.duration_days} days
          </span>
        )}
      </div>
    </Card>
  );
}

/* Trading up is gold and down is ember, which is the one place the palette
   allows a direction to carry colour. A treasury inflow is a member's loss, so
   it is not celebrated: both are stated flatly and the sign does the talking. */
function Delta({ value }: { value: number }) {
  return (
    <span className={value >= 0 ? "tnum text-chart-up" : "tnum text-chart-down"}>
      {value >= 0 ? "+" : ""}
      {value.toLocaleString()}
    </span>
  );
}

/* The ledger's reason codes, in the realm's words. An unknown code renders as
   itself rather than as a guess, so a movement written by something newer than
   this page is still legible instead of silently mislabelled. */
function movementLabel(reason: string): string {
  if (reason === "call_stake_burned") return "A staked Call missed";
  if (reason === "wardens_pardon") return "The Warden's Pardon paid out";
  if (reason.startsWith("perk_")) {
    const slug = reason.slice(5);
    if (slug === "wardens-pardon") return "Bought The Warden's Pardon";
    if (slug === "the-standard") return "Bought The Standard";
    if (slug === "long-watch") return "Bought The Long Watch";
    return `Bought ${slug}`;
  }
  return reason;
}

function movedOn(entry: TreasuryEntryView): string {
  return new Date(entry.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function expiryLine(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "spent";
  const hours = Math.floor(ms / 3.6e6);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hours left`;
  return `${Math.max(1, Math.floor(ms / 6e4))} minutes left`;
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
