import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emit } from "@/lib/realm/events";
import { HOUSE_TOP_N, houses } from "@/lib/data/houses";
import {
  HOUSE_ROLES,
  MASTER_OF_RAVENS_MIN_CALLS,
  type HouseRole,
} from "@/lib/houses/roles";
import type { SeasonRow } from "@/lib/houses/oath";

/* Size-neutral House scoring and computed seasonal leadership.
   V2 sections 11.1b and 11.2.

   A House's score is the sum of its top 20 contributors' season contribution
   and nothing else. Six Houses of unequal membership summed across every
   member is a headcount contest; a fixed N is exactly size neutral, which is
   the fix Lichess team battles converged on. Ties break on those same members'
   mean, so a House that reached the score with twenty steady members does not
   tie a House that reached it with three exceptional ones.

   Contribution itself is never stored against a member. It is derived in
   Postgres by house_season_contributions, which joins points_ledger against
   the oath window that contained each row. Everything the oath rules promise
   about contribution follows from that join rather than from any code here.

   Contribution has two sources, kept disjoint in SQL. Everything that flows
   through award() lands in points_ledger. Calls V2 settles through the
   apply_call_score RPC instead, which writes no ledger row, so the Call's
   score is read off the post where lib/calls/types.ts documents it. See
   migration 20260812010000 for why the two cannot double count. */

export interface ContributorRow {
  house_slug: string;
  profile_id: string;
  glory: number;
  sworn_at: string;
}

export interface HouseStanding {
  slug: string;
  /* Sum of the top HOUSE_TOP_N contributors. */
  score: number;
  /* Mean of those same contributors. The tiebreak. */
  mean: number;
  contributorCount: number;
  memberCount: number;
  rank: number;
  /* The contributing members, best first. The live "who is carrying our
     House" board, which is the single strongest signal that a House is alive. */
  contributors: ContributorRow[];
}

/* Every member's contribution for one season, attributed to the House whose
   banner they were under when they earned it. */
export async function loadSeasonContributions(
  db: SupabaseClient,
  seasonId: number
): Promise<ContributorRow[]> {
  const { data, error } = await db.rpc("house_season_contributions", {
    p_season_id: seasonId,
  });
  if (error) return [];
  return ((data ?? []) as ContributorRow[]).map((r) => ({
    ...r,
    glory: Number(r.glory) || 0,
  }));
}

/* How many members are sworn to each House right now, from the oath ledger
   rather than the houses.member_count counter, which is maintained by hand at
   onboarding and drifts. */
export async function loadMemberCounts(
  db: SupabaseClient
): Promise<Map<string, number>> {
  const { data } = await db
    .from("house_members")
    .select("house_slug")
    .is("left_at", null);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { house_slug: string }[]) {
    counts.set(row.house_slug, (counts.get(row.house_slug) ?? 0) + 1);
  }
  return counts;
}

/* Build the standings. Every House appears, including the ones that have
   contributed nothing: a House at zero is an honest standing, not an absence,
   and hiding it would hide the underdog the whole design is about. */
export function buildStandings(
  contributions: ContributorRow[],
  memberCounts: Map<string, number>
): HouseStanding[] {
  const byHouse = new Map<string, ContributorRow[]>();
  for (const row of contributions) {
    const list = byHouse.get(row.house_slug);
    if (list) list.push(row);
    else byHouse.set(row.house_slug, [row]);
  }

  const standings: HouseStanding[] = houses.map((house) => {
    const all = (byHouse.get(house.slug) ?? []).sort(
      (a, b) => b.glory - a.glory
    );
    const counted = all.slice(0, HOUSE_TOP_N);
    const score = counted.reduce((sum, c) => sum + c.glory, 0);
    return {
      slug: house.slug,
      score,
      mean: counted.length > 0 ? score / counted.length : 0,
      contributorCount: all.length,
      memberCount: memberCounts.get(house.slug) ?? 0,
      rank: 0,
      contributors: all,
    };
  });

  standings.sort((a, b) => b.score - a.score || b.mean - a.mean);
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });
  return standings;
}

/* The nearest House by score, named explicitly. A standings table tells a
   member where they sit; a rival tells them who to beat, which is the part
   that makes anyone act. */
export function rivalOf(
  standings: HouseStanding[],
  slug: string
): { slug: string; gap: number; ahead: boolean } | null {
  const index = standings.findIndex((s) => s.slug === slug);
  if (index === -1) return null;
  const self = standings[index];
  const above = standings[index - 1];
  const below = standings[index + 1];

  /* Prefer the House immediately above: the one you are chasing is a better
     rival than the one chasing you. Fall back to the House below when you are
     already top. */
  if (above) {
    return { slug: above.slug, gap: above.score - self.score, ahead: false };
  }
  if (below) {
    return { slug: below.slug, gap: self.score - below.score, ahead: true };
  }
  return null;
}

/* Cumulative contribution per House across every season resolved so far. This
   is what House level is built from, and it never resets. */
export async function loadCumulative(
  db: SupabaseClient,
  /* The season being scored live. Excluded so the caller can add the live
     score without counting the last recompute pass a second time. */
  excludeSeasonId?: number | null
): Promise<Map<string, number>> {
  let q = db.from("house_season_scores").select("house_slug, score");
  if (excludeSeasonId != null) q = q.neq("season_id", excludeSeasonId);
  const { data } = await q;
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { house_slug: string; score: number }[]) {
    totals.set(
      row.house_slug,
      (totals.get(row.house_slug) ?? 0) + (Number(row.score) || 0)
    );
  }
  return totals;
}

/* ------------------------------------------------------------------
   Computed leadership
   ------------------------------------------------------------------ */

export interface RoleAward {
  role: HouseRole;
  profileId: string;
  /* The number that won it, for the roster to show its working. */
  value: number;
}

interface LeadershipInput {
  db: SupabaseClient;
  season: SeasonRow;
  houseSlug: string;
  memberIds: string[];
  /* Season contribution, best first, already scoped to this House. */
  contributors: ContributorRow[];
}

/* Sum a numeric metric per member, best first. */
function topOf(totals: Map<string, number>): { id: string; value: number }[] {
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value);
}

async function callAccuracy(
  input: LeadershipInput
): Promise<{ id: string; value: number }[]> {
  const { db, season, memberIds } = input;
  const { data } = await db
    .from("posts")
    .select("author_id, call")
    .eq("kind", "call")
    .eq("deleted", false)
    .in("author_id", memberIds)
    .gte("created_at", season.starts_at)
    .lt("created_at", season.ends_at)
    .limit(2000);

  const tally = new Map<string, { hits: number; total: number }>();
  for (const row of (data ?? []) as {
    author_id: string;
    call: { verdict?: string } | null;
  }[]) {
    const verdict = row.call?.verdict;
    if (verdict !== "hit" && verdict !== "miss") continue;
    const entry = tally.get(row.author_id) ?? { hits: 0, total: 0 };
    entry.total += 1;
    if (verdict === "hit") entry.hits += 1;
    tally.set(row.author_id, entry);
  }

  /* The volume gate is the whole point of the title. Three lucky Calls at 100%
     is not the best Call accuracy in a House, it is three lucky Calls. */
  return [...tally.entries()]
    .filter(([, e]) => e.total >= MASTER_OF_RAVENS_MIN_CALLS)
    .map(([id, e]) => ({ id, value: e.hits / e.total }))
    .sort((a, b) => b.value - a.value);
}

async function warGlory(
  input: LeadershipInput
): Promise<{ id: string; value: number }[]> {
  const { db, season, memberIds } = input;
  const { data } = await db
    .from("war_battles")
    .select("profile_id, glory_earned")
    .in("profile_id", memberIds)
    .gte("created_at", season.starts_at)
    .lt("created_at", season.ends_at)
    .limit(5000);

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as {
    profile_id: string;
    glory_earned: number | null;
  }[]) {
    totals.set(
      row.profile_id,
      (totals.get(row.profile_id) ?? 0) + (row.glory_earned ?? 0)
    );
  }
  return topOf(totals);
}

async function engagement(
  input: LeadershipInput
): Promise<{ id: string; value: number }[]> {
  const { db, season, memberIds } = input;
  const { data } = await db
    .from("posts")
    .select("author_id, like_count, reply_count, repost_count")
    .eq("deleted", false)
    .in("author_id", memberIds)
    .gte("created_at", season.starts_at)
    .lt("created_at", season.ends_at)
    .limit(5000);

  /* Weighted toward the responses that cost something to give. A repost puts
     the author's own name behind a raven, so it counts for most. */
  const totals = new Map<string, number>();
  for (const row of (data ?? []) as {
    author_id: string;
    like_count: number | null;
    reply_count: number | null;
    repost_count: number | null;
  }[]) {
    const value =
      (row.like_count ?? 0) +
      (row.reply_count ?? 0) * 2 +
      (row.repost_count ?? 0) * 3;
    totals.set(row.author_id, (totals.get(row.author_id) ?? 0) + value);
  }
  return topOf(totals);
}

async function activatedReferrals(
  input: LeadershipInput
): Promise<{ id: string; value: number }[]> {
  const { db, season, memberIds } = input;
  /* "Referrals who actually became active", not referrals who clicked. The
     activated flag is set when the recruit does something real. */
  const { data } = await db
    .from("referrals")
    .select("referrer_id")
    .in("referrer_id", memberIds)
    .eq("activated", true)
    .gte("created_at", season.starts_at)
    .lt("created_at", season.ends_at)
    .limit(5000);

  const totals = new Map<string, number>();
  for (const row of (data ?? []) as { referrer_id: string }[]) {
    totals.set(row.referrer_id, (totals.get(row.referrer_id) ?? 0) + 1);
  }
  return topOf(totals);
}

/* Derive one House's leadership for one season.

   Each member holds at most one title. Lord and Hand are settled first because
   they are the two the contribution ladder defines outright; the specialist
   titles then go to the best remaining untitled member. Spreading them is
   deliberate: the point of six titles is that six different people carry
   something, not that the season's top contributor collects the set. */
export async function deriveLeadership(
  input: LeadershipInput
): Promise<RoleAward[]> {
  const awards: RoleAward[] = [];
  const taken = new Set<string>();

  const claim = (role: HouseRole, id: string | undefined, value: number) => {
    if (!id || taken.has(id)) return;
    taken.add(id);
    awards.push({ role, profileId: id, value });
  };

  const ranked = input.contributors.filter((c) => c.glory > 0);
  claim("lord", ranked[0]?.profile_id, ranked[0]?.glory ?? 0);
  claim("hand", ranked[1]?.profile_id, ranked[1]?.glory ?? 0);

  if (input.memberIds.length > 0) {
    const [ravens, war, chronicle, recruits] = await Promise.all([
      callAccuracy(input),
      warGlory(input),
      engagement(input),
      activatedReferrals(input),
    ]);

    const specialists: [HouseRole, { id: string; value: number }[]][] = [
      ["master-of-ravens", ravens],
      ["master-of-war", war],
      ["chronicler", chronicle],
      ["recruiter", recruits],
    ];

    for (const [role, ladder] of specialists) {
      const winner = ladder.find((entry) => !taken.has(entry.id));
      if (winner) claim(role, winner.id, winner.value);
    }
  }

  return awards;
}

/* ------------------------------------------------------------------
   The recompute pass
   ------------------------------------------------------------------ */

export interface RecomputeResult {
  seasonId: number;
  standings: HouseStanding[];
  roles: Record<string, RoleAward[]>;
  overtakes: { house: string; passed: string; rank: number }[];
}

/* Recompute the standings and the leadership for one season, and record what
   changed. Called by the resolution cron and by an admin trigger.

   Idempotent: it derives everything from the ledger and the oath history, so
   running it twice in a row produces the same rows and no second event. */
export async function recomputeSeason(
  db: SupabaseClient,
  season: SeasonRow
): Promise<RecomputeResult> {
  const [contributions, memberCounts, previous] = await Promise.all([
    loadSeasonContributions(db, season.id),
    loadMemberCounts(db),
    db
      .from("house_season_scores")
      .select("house_slug, rank, score")
      .eq("season_id", season.id),
  ]);

  const standings = buildStandings(contributions, memberCounts);

  const priorRank = new Map<string, number>();
  for (const row of (previous.data ?? []) as {
    house_slug: string;
    rank: number;
  }[]) {
    priorRank.set(row.house_slug, row.rank);
  }

  await db.from("house_season_scores").upsert(
    standings.map((s) => ({
      season_id: season.id,
      house_slug: s.slug,
      score: s.score,
      mean: Number(s.mean.toFixed(2)),
      contributor_count: s.contributorCount,
      member_count: s.memberCount,
      rank: s.rank,
      computed_at: new Date().toISOString(),
    })),
    { onConflict: "season_id,house_slug" }
  );

  /* Keep the denormalised counter honest while we are here. It was incremented
     by hand at onboarding and never decremented by anything. */
  for (const standing of standings) {
    await db
      .from("houses")
      .update({ member_count: standing.memberCount })
      .eq("slug", standing.slug)
      .neq("member_count", standing.memberCount);
  }

  /* A House that climbed past another since the last pass. Only real movement
     counts: a House with no score cannot overtake anyone. */
  const overtakes: RecomputeResult["overtakes"] = [];
  for (const standing of standings) {
    const before = priorRank.get(standing.slug);
    if (before === undefined || standing.rank >= before || standing.score <= 0)
      continue;
    const passed = standings.find(
      (other) =>
        other.slug !== standing.slug &&
        other.rank > standing.rank &&
        (priorRank.get(other.slug) ?? Infinity) < before
    );
    if (!passed) continue;
    overtakes.push({
      house: standing.slug,
      passed: passed.slug,
      rank: standing.rank,
    });
  }

  for (const overtake of overtakes.slice(0, 3)) {
    await emit(db, {
      kind: "house.overtake",
      subjectType: "house",
      subjectId: overtake.house,
      houseSlug: overtake.house,
      payload: {
        v: 1,
        season_id: season.id,
        passed: overtake.passed,
        rank: overtake.rank,
      },
    });
  }

  /* Leadership. Every open oath drops back to sworn first, so a title a member
     no longer holds does not linger on their name for another season. */
  const membersByHouse = new Map<string, string[]>();
  const { data: openOaths } = await db
    .from("house_members")
    .select("id, profile_id, house_slug, role")
    .is("left_at", null);

  for (const row of (openOaths ?? []) as {
    profile_id: string;
    house_slug: string;
  }[]) {
    const list = membersByHouse.get(row.house_slug);
    if (list) list.push(row.profile_id);
    else membersByHouse.set(row.house_slug, [row.profile_id]);
  }

  const roles: Record<string, RoleAward[]> = {};
  for (const standing of standings) {
    const memberIds = membersByHouse.get(standing.slug) ?? [];
    if (memberIds.length === 0) {
      roles[standing.slug] = [];
      continue;
    }
    const awards = await deriveLeadership({
      db,
      season,
      houseSlug: standing.slug,
      memberIds,
      contributors: standing.contributors,
    });
    roles[standing.slug] = awards;

    const titled = new Set(awards.map((a) => a.profileId));
    const demoted = memberIds.filter((id) => !titled.has(id));
    if (demoted.length > 0) {
      await db
        .from("house_members")
        .update({ role: "sworn" })
        .is("left_at", null)
        .in("profile_id", demoted)
        .neq("role", "sworn");
    }
    for (const award of awards) {
      await db
        .from("house_members")
        .update({ role: award.role })
        .is("left_at", null)
        .eq("profile_id", award.profileId);
    }
  }

  return { seasonId: season.id, standings, roles, overtakes };
}

export { HOUSE_ROLES };
