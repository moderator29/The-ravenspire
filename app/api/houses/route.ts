import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { houseLevel } from "@/lib/data/houses";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { loadSeasonWindow } from "@/lib/houses/oath";
import {
  buildStandings,
  loadCumulative,
  loadMemberCounts,
  loadSeasonContributions,
  rivalOf,
} from "@/lib/houses/scoring";

/* GET /api/houses
 *
 * The standings, scored the way section 11.1b requires: each House is the sum
 * of its top 20 contributors only, which is size neutral, with the mean as the
 * tiebreak. The old page read houses.glory, an all-time counter that six
 * Houses of unequal size turn into a headcount contest.
 *
 * Computed live from the ledger rather than read from the cache table, so the
 * board is never stale between recompute passes. The cache exists so the
 * recompute pass can tell what moved, and so House level has a per-season
 * history to sum.
 *
 * Real data only. With nothing contributed yet, every House honestly reads
 * zero rather than being hidden. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  /* Public and computed live from the ledger on every call, which is exactly
     the shape worth metering: the standings query fans out across the whole
     contribution table. Generous, and a member refreshing the board never
     meets it.

     B6: callerKey rather than ipKey, the same key the rest of the
     member-and-visitor family uses. On ipKey a whole office, campus or mobile
     carrier NAT shares one allowance, so the standings could go dark for a
     member because of strangers behind the same address; on callerKey a
     signed-in member is metered on their own account and only genuine
     visitors fall back to the address. */
  const viewer = await getProfile(req);
  const rl = await rateLimit(callerKey("houses", req, viewer?.id), 120, 3600);
  if (!rl.ok)
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const window = await loadSeasonWindow(db);
  const season = window.latest;

  const [contributions, memberCounts, cumulative] = await Promise.all([
    season ? loadSeasonContributions(db, season.id) : Promise.resolve([]),
    loadMemberCounts(db),
    loadCumulative(db, season?.id ?? null),
  ]);

  const standings = buildStandings(contributions, memberCounts);

  return json({
    season: season
      ? {
          id: season.id,
          name: season.name,
          starts_at: season.starts_at,
          ends_at: season.ends_at,
          status: season.status,
        }
      : null,
    offSeason: window.offSeason,
    houses: standings.map((s) => {
      /* Every earlier season already resolved into the cache, plus this
         season's live score, so the level bar moves during a season instead of
         jumping once at the close. */
      const total = (cumulative.get(s.slug) ?? 0) + s.score;
      return {
        slug: s.slug,
        rank: s.rank,
        score: s.score,
        mean: Number(s.mean.toFixed(2)),
        contributor_count: s.contributorCount,
        member_count: s.memberCount,
        counted: Math.min(s.contributorCount, 20),
        rival: rivalOf(standings, s.slug),
        level: houseLevel(total),
        cumulative: total,
      };
    }),
  });
}
