import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { HOUSE_TOP_N, houseBySlug, houseLevel } from "@/lib/data/houses";
import { loadSeasonWindow, oathSpan, type OathRow } from "@/lib/houses/oath";
import { loadIdentities, loadRoster } from "@/lib/houses/members";
import {
  HOUSE_PERKS,
  PERK_META,
  maySpendTreasury,
  perkIsActive,
  perkPrice,
} from "@/lib/houses/perks";
import { loadHousePerks, loadTreasuryLedger } from "@/lib/houses/treasury";
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
  req: Request,
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

  /* The treasury: a real balance from real sinks, the perks it has bought, and
     the audit trail of every movement. A House that has never had a stake burn
     under its banner reads as zero here and the hall says zero. Nothing is
     seeded and nothing is estimated.

     The viewer is resolved so the hall knows whether to render the catalogue
     as buyable or as a price list. That is presentation only: the Lord and
     Hand check that actually governs the spend is inside
     spend_house_treasury, under the House row lock, and a client that lied
     about its own role would get a 403 from the RPC. */
  const viewer = await getProfile(req);
  const [houseRow, perks, treasuryLedger] = await Promise.all([
    db.from("houses").select("treasury").eq("slug", slug).maybeSingle(),
    loadHousePerks(db, slug),
    loadTreasuryLedger(db, slug),
  ]);

  const treasury = Number(houseRow.data?.treasury) || 0;
  const swornHere = roster.length;
  /* Read off the roster, which is house_members with an open oath to THIS
     House, rather than off profiles.house_slug. The RPC that governs the spend
     reads the same table, so the button a member sees and the answer they get
     when they press it cannot disagree. */
  const viewerRole = viewer
    ? (roster.find((r) => r.profile_id === viewer.id)?.role ?? null)
    : null;

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
    treasury: {
      balance: treasury,
      sworn: swornHere,
      /* The catalogue, priced against this House's real sworn count so the
         figure shown is the figure charged. Per member pricing is what keeps
         perks from reintroducing the headcount advantage that size-neutral
         scoring removed; the reasoning is in lib/houses/perks.ts. */
      catalogue: HOUSE_PERKS.map((slug) => {
        const meta = PERK_META[slug];
        const price = perkPrice(meta, swornHere);
        return {
          slug: meta.slug,
          name: meta.name,
          blurb: meta.blurb,
          effect: meta.effect,
          icon: meta.icon,
          duration_days: meta.durationDays,
          price,
          affordable: treasury >= price,
          burning: perks.some(
            (p) => p.slug === meta.slug && Date.parse(p.expires_at) > Date.now()
          ),
        };
      }),
      active: perks.filter((p) => perkIsActive(p)),
      history: perks,
      ledger: treasuryLedger,
      /* Whether THIS viewer may open it. Null when nobody is signed in. */
      may_spend: maySpendTreasury(viewerRole),
      viewer_role: viewerRole,
    },
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
