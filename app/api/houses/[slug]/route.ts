import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { HOUSE_TOP_N, houseBySlug, houseLevel } from "@/lib/data/houses";
import { loadSeasonWindow, oathSpan, type OathRow } from "@/lib/houses/oath";
import { loadIdentities, loadRoster } from "@/lib/houses/members";
import {
  buildStandings,
  loadCumulative,
  loadMemberCounts,
  loadSeasonContributions,
  rivalOf,
} from "@/lib/houses/scoring";

/* GET /api/houses/[slug]
 *
 * One House hall: its standing, its real roster with the seasonal titles
 * surfaced, the live top-20 contributor board, and the members who have held
 * its banner in the past.
 *
 * The contributor board is the piece that matters most. "Who is currently
 * carrying our House" is a named, churning, public list, and it is the single
 * best driver of a House feeling alive; Lichess recomputes exactly this after
 * every finished game for exactly this reason. */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { slug } = await ctx.params;
  const meta = houseBySlug(slug);
  if (!meta) return json({ error: "not_found" }, 404);

  const window = await loadSeasonWindow(db);
  const season = window.latest;

  const [contributions, memberCounts, cumulative] = await Promise.all([
    season ? loadSeasonContributions(db, season.id) : Promise.resolve([]),
    loadMemberCounts(db),
    loadCumulative(db, season?.id ?? null),
  ]);

  const standings = buildStandings(contributions, memberCounts);
  const standing = standings.find((s) => s.slug === slug);
  if (!standing) return json({ error: "not_found" }, 404);

  const contributionByMember = new Map<string, number>();
  for (const row of standing.contributors) {
    contributionByMember.set(row.profile_id, row.glory);
  }

  const roster = await loadRoster(db, slug, contributionByMember);
  const identities = new Map(
    roster
      .filter((r) => r.member)
      .map((r) => [r.profile_id, r.member!] as const)
  );

  /* The counted twenty, and the members contributing outside the cut. Showing
     the cut line explicitly is what makes the scoring legible: a member can
     see they are 21st and what it would take to count. */
  const board = standing.contributors.map((c, i) => ({
    rank: i + 1,
    profile_id: c.profile_id,
    contribution: c.glory,
    counts: i < HOUSE_TOP_N,
    role: roster.find((r) => r.profile_id === c.profile_id)?.role ?? "sworn",
    member: identities.get(c.profile_id) ?? null,
  }));

  /* Everyone who ever swore to this House and has since left, newest first.
     Their contribution stayed here; the oath history says so out loud. */
  const { data: pastRows } = await db
    .from("house_members")
    .select("id, profile_id, house_slug, role, sworn_at, left_at, season_id, left_season_id")
    .eq("house_slug", slug)
    .not("left_at", "is", null)
    .order("left_at", { ascending: false })
    .limit(30);

  const past = (pastRows ?? []) as OathRow[];
  const pastIdentities = await loadIdentities(
    db,
    past.map((p) => p.profile_id)
  );

  const banked = cumulative.get(slug) ?? 0;
  const total = banked + standing.score;

  return json({
    house: {
      slug: meta.slug,
      name: meta.name,
      motto: meta.motto,
      sigil: meta.sigil,
      color: meta.color,
      desc: meta.desc,
    },
    season: season
      ? { id: season.id, name: season.name, ends_at: season.ends_at }
      : null,
    offSeason: window.offSeason,
    standing: {
      rank: standing.rank,
      score: standing.score,
      mean: Number(standing.mean.toFixed(2)),
      contributor_count: standing.contributorCount,
      member_count: standing.memberCount,
      counted: Math.min(standing.contributorCount, HOUSE_TOP_N),
      top_n: HOUSE_TOP_N,
    },
    rival: (() => {
      const r = rivalOf(standings, slug);
      if (!r) return null;
      const rivalMeta = houseBySlug(r.slug);
      const rivalStanding = standings.find((s) => s.slug === r.slug);
      return {
        slug: r.slug,
        name: rivalMeta?.name ?? r.slug,
        color: rivalMeta?.color ?? null,
        gap: r.gap,
        ahead: r.ahead,
        score: rivalStanding?.score ?? 0,
      };
    })(),
    level: { ...houseLevel(total), cumulative: total },
    board,
    roster,
    past: past.map((p) => ({
      profile_id: p.profile_id,
      span: oathSpan(p),
      left_at: p.left_at,
      member: pastIdentities.get(p.profile_id) ?? null,
    })),
  });
}
