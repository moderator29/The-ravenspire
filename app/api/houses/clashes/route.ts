import { json, requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { HOUSE_TOP_N, houseBySlug, houses } from "@/lib/data/houses";
import { loadIdentities } from "@/lib/houses/members";
import { loadSeasonWindow } from "@/lib/houses/oath";
import { emit } from "@/lib/realm/events";

/* House Clashes (V2 section 11.3).
 *
 * A Clash is a 48 hour window on one nominated token or theme. Only Calls made
 * inside that window count. Standings tables are not events; Lichess team
 * battles and Chess.com club matches work because they are scheduled, bounded,
 * and have a live scoreboard with named contributors. This is that.
 *
 * There is no entries table and no new scoring maths. An entry is a Call, and
 * its worth is the glory that Call earned, which is the same currency the
 * season standings use. house_clash_contributions derives the whole board.
 *
 * GET  ?id=<uuid>  one Clash with its full scoreboard
 * GET              every Clash, live first, each with its House scoreboard
 * POST             open a Clash (admin) */

export const dynamic = "force-dynamic";

const CLASH_SELECT =
  "id, title, token, theme, starts_at, ends_at, season_id, created_at";

/* A Clash runs for 48 hours. Fixed, because a bounded window is the mechanic:
   a Clash you can enter whenever is just the leaderboard again. */
const CLASH_HOURS = 48;

interface ClashRow {
  id: string;
  title: string;
  token: string | null;
  theme: string | null;
  starts_at: string;
  ends_at: string;
  season_id: number | null;
  created_at: string;
}

interface ContributionRow {
  house_slug: string;
  profile_id: string;
  glory: number;
  calls: number;
  hits: number;
  misses: number;
  open_calls: number;
}

function phaseOf(clash: ClashRow, now = Date.now()) {
  const start = Date.parse(clash.starts_at);
  const end = Date.parse(clash.ends_at);
  if (now < start) return "upcoming" as const;
  if (now < end) return "live" as const;
  return "closed" as const;
}

async function scoreboard(
  db: NonNullable<ReturnType<typeof adminClient>>,
  clashId: string
) {
  const { data, error } = await db.rpc("house_clash_contributions", {
    p_clash_id: clashId,
  });
  if (error) return { houses: [], contributors: [] };

  const rows = ((data ?? []) as ContributionRow[]).map((r) => ({
    ...r,
    glory: Number(r.glory) || 0,
  }));

  const identities = await loadIdentities(
    db,
    rows.map((r) => r.profile_id)
  );

  const byHouse = new Map<string, ContributionRow[]>();
  for (const row of rows) {
    const list = byHouse.get(row.house_slug);
    if (list) list.push(row);
    else byHouse.set(row.house_slug, [row]);
  }

  /* Same top-20 rule as the season standings, for the same reason: a Clash
     that six Houses of unequal size enter is otherwise a headcount contest. */
  const board = houses
    .map((house) => {
      const all = (byHouse.get(house.slug) ?? []).sort(
        (a, b) => b.glory - a.glory || b.hits - a.hits
      );
      const counted = all.slice(0, HOUSE_TOP_N);
      const score = counted.reduce((sum, c) => sum + c.glory, 0);
      return {
        slug: house.slug,
        name: house.name,
        color: house.color,
        score,
        mean: counted.length > 0 ? Number((score / counted.length).toFixed(2)) : 0,
        calls: all.reduce((sum, c) => sum + c.calls, 0),
        hits: all.reduce((sum, c) => sum + c.hits, 0),
        open: all.reduce((sum, c) => sum + c.open_calls, 0),
        contributor_count: all.length,
        rank: 0,
      };
    })
    .sort((a, b) => b.score - a.score || b.mean - a.mean || b.calls - a.calls);
  board.forEach((h, i) => {
    h.rank = i + 1;
  });

  const contributors = rows
    .sort((a, b) => b.glory - a.glory || b.hits - a.hits)
    .slice(0, 60)
    .map((r) => ({
      profile_id: r.profile_id,
      house_slug: r.house_slug,
      house_name: houseBySlug(r.house_slug)?.name ?? r.house_slug,
      glory: r.glory,
      calls: r.calls,
      hits: r.hits,
      misses: r.misses,
      open: r.open_calls,
      member: identities.get(r.profile_id) ?? null,
    }));

  return { houses: board, contributors };
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const { data } = await db
      .from("house_clashes")
      .select(CLASH_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!data) return json({ error: "not_found" }, 404);
    const clash = data as ClashRow;
    return json({
      clash: { ...clash, phase: phaseOf(clash) },
      ...(await scoreboard(db, clash.id)),
    });
  }

  const { data } = await db
    .from("house_clashes")
    .select(CLASH_SELECT)
    .order("starts_at", { ascending: false })
    .limit(12);

  const rows = (data ?? []) as ClashRow[];
  const withBoards = await Promise.all(
    rows.map(async (clash) => ({
      ...clash,
      phase: phaseOf(clash),
      ...(await scoreboard(db, clash.id)),
    }))
  );

  /* Live first, then what is coming, then the record. A Clash surface that
     leads with a finished Clash is a standings table again. */
  const order = { live: 0, upcoming: 1, closed: 2 } as const;
  withBoards.sort(
    (a, b) =>
      order[a.phase] - order[b.phase] ||
      Date.parse(b.starts_at) - Date.parse(a.starts_at)
  );

  return json({ clashes: withBoards });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile?.is_admin) return json({ error: "forbidden" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    token?: string;
    theme?: string;
    starts_at?: string;
  } | null;
  if (!body) return json({ error: "bad_request" }, 400);

  const title = body.title?.trim().slice(0, 120);
  if (!title) return json({ error: "A Clash needs a name" }, 400);

  const token = body.token?.trim().replace(/^\$/, "").toUpperCase() || null;
  const theme = token ? null : body.theme?.trim().slice(0, 120) || null;
  if (!token && !theme)
    return json({ error: "Nominate a token or a theme" }, 400);

  const startsAt = body.starts_at ? new Date(body.starts_at) : new Date();
  if (Number.isNaN(startsAt.getTime()))
    return json({ error: "bad_request" }, 400);
  const endsAt = new Date(startsAt.getTime() + CLASH_HOURS * 3600 * 1000);

  const window = await loadSeasonWindow(db);

  const { data, error } = await db
    .from("house_clashes")
    .insert({
      title,
      token,
      theme,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      season_id: window.latest?.id ?? null,
      created_by: profile.id,
    })
    .select(CLASH_SELECT)
    .single();
  if (error) return json({ error: "create_failed" }, 500);

  /* The realm hears about it. A Clash is the one thing in the product that is
     already a scheduled, bounded, realm wide event authored by a person, which
     is exactly what the directive means by a community event, so it needed a
     producer rather than a new table.
     
     Realm audience and no actor: a Clash is called by the stewards on behalf of
     the realm, and naming the steward who typed it would make an announcement
     read as a member's act. The window travels in the payload so the card can
     say honestly whether it is open, opening or closed without a second read. */
  const row = data as ClashRow;
  await emit(db, {
    kind: "clash.opened",
    subjectType: "clash",
    subjectId: row.id,
    payload: {
      v: 1,
      title: row.title,
      token: row.token,
      theme: row.theme,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      season_id: row.season_id,
    },
  });

  return json({ ok: true, clash: { ...row, phase: phaseOf(row) } });
}
