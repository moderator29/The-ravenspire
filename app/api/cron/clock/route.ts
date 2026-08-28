import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { emit } from "@/lib/realm/events";
import { grantCrest } from "@/lib/points";
import { createNotification } from "@/lib/notifications";
import { HOUSE_TOP_N, houseBySlug } from "@/lib/data/houses";
import { loadSeasonWindow } from "@/lib/houses/oath";
import {
  CLASH_HOURS,
  SEASON_CHAMPION_CREST_SLUG,
  SEASON_CHAMPION_RANKS,
  nextClashWindow,
  seasonDueToClose,
  type SeasonClock,
} from "@/lib/realm/appointments";

/* THE REALM'S CLOCK, as a scheduled job.
 *
 * One job, three appointments, because they share a clock and splitting them
 * across three cron entries would let the realm hold three opinions about what
 * time it is:
 *
 *   1. Open the next weekly Clash, if it does not exist yet.
 *   2. Settle every Clash whose window has closed.
 *   3. Close every season whose end has passed.
 *
 * THE THREE PROPERTIES A SCHEDULED JOB IN THIS REALM MUST HAVE
 *
 * Idempotent. Nothing here reads a state and then writes it from application
 * code. Opening is guarded by a unique index on the ISO week, settling by a
 * row lock and a conditional stamp inside public.settle_house_clash, and
 * closing by a status check under a row lock inside public.close_season. A
 * guard written in TypeScript races a cron that overlaps itself; a unique
 * index and a row lock do not.
 *
 * Safe to run twice in the same window. A second invocation a second later
 * finds the Clash row already there, every closed Clash already stamped, and
 * the season already 'settled', and writes nothing at all.
 *
 * Safe to miss a run. Every question this job asks is "what is true now",
 * never "what happened since I last ran". A missed week does not need
 * backfilling because nextClashWindow always names a window that can still be
 * entered, and a season that ended nine days ago is just as due as one that
 * ended nine minutes ago.
 *
 * WHY IT DOES NOT PAY ANYTHING
 * Settling a Clash pays no Glory, and the reasoning is in the migration: a
 * Clash score IS Glory that the Calls on the board already earned and were
 * already paid for. Paying it again at settlement would credit one act twice
 * and make a Clash the cheapest Glory in the realm. What settlement produces
 * is a permanent record, which is the one thing the realm can hand out without
 * devaluing anything.
 *
 * The season close is the exception, and it pays the only currency an
 * appointment can safely mint: a crest. */

export const dynamic = "force-dynamic";

/* How many closed Clashes one invocation will settle. There should never be
   more than one, since they close weekly and this runs hourly, so anything
   above one is a job coming back from an outage. Bounded so that a realm which
   has been down for a year settles its backlog over several runs rather than
   timing out on all of it and never settling any. */
const SETTLE_BATCH = 12;

interface ClashRow {
  id: string;
  title: string;
  token: string | null;
  theme: string | null;
  starts_at: string;
  ends_at: string;
  scheduled_week: string | null;
}

interface Champion {
  profile_id: string;
  rank: number;
}

/* Postgres unique violation. Hitting house_clashes_scheduled_week_idx means
   another invocation opened this week's Clash first, which is the index doing
   its job and not an error. */
const UNIQUE_VIOLATION = "23505";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return json({ error: "forbidden" }, 403);
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "cron secret not configured" }, 503);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* One `now` for the whole invocation. Three appointments read from it, and a
     job that read the clock three times could open a Clash for one week and
     settle against another if it happened to straddle a boundary. */
  const now = new Date();

  const opened = await openNextClash(db, now);
  const settled = await settleClosedClashes(db);
  const seasons = await closeDueSeasons(db, now);

  return json({ ok: true, at: now.toISOString(), opened, settled, seasons });
}

/* Some cron platforms can only issue POST. Same work, same authorization. */
export async function POST(req: Request) {
  return GET(req);
}

/* ------------------------------------------------------------------
   1. Open the next weekly Clash
   ------------------------------------------------------------------ */

async function openNextClash(
  db: NonNullable<ReturnType<typeof adminClient>>,
  now: Date
) {
  const window = nextClashWindow(now);

  /* The fast path. The unique index is still the guarantee; this saves an
     insert that would fail on all but one invocation in a hundred and sixty
     eight, since this runs hourly and a Clash is weekly. */
  const { data: existing } = await db
    .from("house_clashes")
    .select("id")
    .eq("scheduled_week", window.week)
    .maybeSingle();
  if (existing) return { week: window.week, created: false };

  const season = await loadSeasonWindow(db);

  /* A THEME Clash, and never a token one.
   *
   * A token Clash counts only Calls on one nominated token, and no scheduler
   * can nominate a token without inventing one. Picking "whatever is trending"
   * would make the realm's own weekly fixture depend on a third party price
   * feed and would produce a different competition every week for reasons no
   * member could see. Picking a favourite would be the platform putting its
   * thumb on a market.
   *
   * A theme Clash counts every Call sealed inside the window, which needs
   * nothing invented at all: the rule is the window itself. Stewards can still
   * call a token Clash by hand, and those carry no scheduled_week and sit
   * beside this one rather than replacing it. */
  const week = window.week.slice(-2).replace(/^0/, "");
  const { error } = await db.from("house_clashes").insert({
    title: `The Clash of Week ${week}`,
    token: null,
    theme: "Every Call sealed inside the window",
    starts_at: window.opensAt.toISOString(),
    ends_at: window.closesAt.toISOString(),
    scheduled_week: window.week,
    season_id: season.latest?.id ?? null,
    /* No author. A scheduled Clash is called by the calendar, and attributing
       it to whichever steward happens to be an admin would be a lie about who
       decided it. */
    created_by: null,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { week: window.week, created: false };
    }
    console.error("[clock] could not open the weekly Clash", error.message);
    return { week: window.week, created: false, error: "insert_failed" };
  }

  /* Read back rather than using the insert's return, so the event carries the
     row the database actually holds. */
  const { data: row } = await db
    .from("house_clashes")
    .select("id, title, token, theme, starts_at, ends_at, scheduled_week")
    .eq("scheduled_week", window.week)
    .maybeSingle();

  if (row) {
    const clash = row as ClashRow;
    await emit(db, {
      kind: "clash.opened",
      subjectType: "clash",
      subjectId: clash.id,
      payload: {
        v: 1,
        title: clash.title,
        token: clash.token,
        theme: clash.theme,
        starts_at: clash.starts_at,
        ends_at: clash.ends_at,
        scheduled_week: clash.scheduled_week,
        season_id: season.latest?.id ?? null,
        hours: CLASH_HOURS,
      },
    });
  }

  return { week: window.week, created: true };
}

/* ------------------------------------------------------------------
   2. Settle every closed Clash
   ------------------------------------------------------------------ */

async function settleClosedClashes(
  db: NonNullable<ReturnType<typeof adminClient>>
) {
  /* `ends_at` is compared against the database's own clock inside
     public.settle_house_clash, not against this host's. This filter is only a
     way of not fetching rows the function would refuse; the refusal is what
     makes an early settlement impossible. */
  const { data } = await db
    .from("house_clashes")
    .select("id, title, token, theme, starts_at, ends_at, scheduled_week")
    .is("settled_at", null)
    .lt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true })
    .limit(SETTLE_BATCH);

  const rows = (data ?? []) as ClashRow[];
  const results: {
    id: string;
    settled: boolean;
    winner: string | null;
    reason?: string;
  }[] = [];

  for (const clash of rows) {
    const { data: verdict, error } = await db.rpc("settle_house_clash", {
      p_clash_id: clash.id,
      /* The same size neutral cut the live board and the season standings use.
         Passed in so there is one definition of it in the product rather than
         a copy in plpgsql that a retune would leave behind. */
      p_top_n: HOUSE_TOP_N,
    });

    if (error) {
      console.error("[clock] clash settlement failed", clash.id, error.message);
      results.push({ id: clash.id, settled: false, winner: null, reason: "rpc_failed" });
      continue;
    }

    const out = (verdict ?? {}) as {
      settled?: boolean;
      reason?: string;
      winner?: string | null;
      winner_score?: number;
      entrant_houses?: number;
    };

    if (!out.settled) {
      results.push({
        id: clash.id,
        settled: false,
        winner: null,
        reason: out.reason ?? "refused",
      });
      continue;
    }

    /* The card. Emitted after the settlement rather than inside it, because an
       event is a record of something that already happened: a failed insert
       here must never roll back a result that is correctly frozen. The once
       index on (kind, subject_id) makes a re-run write one card, not two. */
    await emit(db, {
      kind: "clash.settled",
      subjectType: "clash",
      subjectId: clash.id,
      payload: {
        v: 1,
        title: clash.title,
        token: clash.token,
        theme: clash.theme,
        starts_at: clash.starts_at,
        ends_at: clash.ends_at,
        winner_slug: out.winner ?? null,
        winner_name: out.winner ? (houseBySlug(out.winner)?.name ?? out.winner) : null,
        winner_score: out.winner_score ?? 0,
        /* Zero is the honest answer for a Clash nobody entered, and the card
           reads it and says so rather than crowning the first House
           alphabetically. */
        entrant_houses: out.entrant_houses ?? 0,
      },
      houseSlug: out.winner ?? null,
    });

    results.push({ id: clash.id, settled: true, winner: out.winner ?? null });
  }

  return results;
}

/* ------------------------------------------------------------------
   3. Close every due season
   ------------------------------------------------------------------ */

async function closeDueSeasons(
  db: NonNullable<ReturnType<typeof adminClient>>,
  now: Date
) {
  const { data } = await db
    .from("seasons")
    .select("id, name, status, ends_at")
    .eq("status", "active")
    .order("id", { ascending: true });

  const due = ((data ?? []) as (SeasonClock & { name: string })[]).filter((s) =>
    seasonDueToClose(s, now)
  );

  const closed: {
    id: number;
    members: number;
    champions: number;
    crests: number;
  }[] = [];

  for (const season of due) {
    const { data: verdict, error } = await db.rpc("close_season", {
      p_season_id: season.id,
      p_champion_ranks: SEASON_CHAMPION_RANKS,
      /* Never forced from the clock. Force means "close it early", which is a
         steward's decision and not a scheduler's. */
      p_force: false,
    });

    if (error) {
      console.error("[clock] season close failed", season.id, error.message);
      continue;
    }

    const out = (verdict ?? {}) as {
      closed?: boolean;
      members?: number;
      total_points?: number;
      champions?: Champion[];
    };
    if (!out.closed) continue;

    const champions = out.champions ?? [];
    const crests = await crownChampions(db, season.id, season.name, champions);

    /* The realm hears the season close. Aggregate figures only: publishing one
       member's earned balance to the realm is a privacy decision nobody has
       made, and rule 7 constrains how a balance may be shown at all. Once
       only, keyed on the season, so nothing announces the same close twice. */
    await emit(db, {
      kind: "season.milestone",
      subjectType: "season",
      subjectId: `season:${season.id}:settled`,
      payload: {
        v: 1,
        phase: "settled",
        season_id: season.id,
        name: season.name,
        ends_at: season.ends_at,
        members: out.members ?? 0,
        total_points: out.total_points ?? 0,
        champions: champions.length,
      },
    });

    closed.push({
      id: season.id,
      members: out.members ?? 0,
      champions: champions.length,
      crests,
    });
  }

  return closed;
}

/* `champion-of-the-season`, the permanent badge a member keeps.
 *
 * The other crest the catalogue has always described and nothing could ever
 * grant: "for those who stood highest when the Season closed", legendary,
 * locked, with a frozen token id and a drawn glyph and no producer anywhere in
 * the product. The season close is its producer.
 *
 * Granted OUTSIDE close_season on purpose. The close has to be one transaction
 * because it freezes and then destroys the numbers it froze; granting a crest
 * does not, and folding a notification insert into that transaction would mean
 * a failed notification rolling back a whole season's settlement. The grant is
 * idempotent by its own unique key, and the champions were read back out of
 * the frozen settlement rows rather than recomputed, so the crest and the
 * record can never name different members. */
/* Written out rather than suffixed. A naive `${rank}th` renders rank three as
   "3th", and the podium is exactly the range where that is visible. */
function ordinal(rank: number): string {
  if (rank === 1) return "first";
  if (rank === 2) return "second";
  if (rank === 3) return "third";
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

async function crownChampions(
  db: NonNullable<ReturnType<typeof adminClient>>,
  seasonId: number,
  seasonName: string,
  champions: Champion[]
): Promise<number> {
  let granted = 0;

  for (const champion of champions) {
    if (!champion?.profile_id) continue;

    const { data: held } = await db
      .from("user_crests")
      .select("crest_slug")
      .eq("profile_id", champion.profile_id)
      .eq("crest_slug", SEASON_CHAMPION_CREST_SLUG)
      .maybeSingle();

    await grantCrest(db, champion.profile_id, SEASON_CHAMPION_CREST_SLUG);
    granted += 1;

    /* A member who already held the crest from an earlier season keeps it and
       is not told twice. The crest is held once; the seasons it was won in are
       the settlement rows, which are per season and permanent. */
    if (held) continue;

    /* B3: through createNotification, so the realtime nudge fires. The crest
       slug in ref is why notifications.subject_id had to become text
       (20260828093353): as a uuid column it rejected the slug with 22P02, so
       no season champion has ever been told. */
    await createNotification(db, {
      profile_id: champion.profile_id,
      kind: "crest",
      ref: SEASON_CHAMPION_CREST_SLUG,
      body: `You finished ${ordinal(champion.rank)} in ${seasonName} and earned the Champion of the Season crest.`,
    });

    await emit(db, {
      kind: "crest.earned",
      actorId: champion.profile_id,
      subjectType: "crest",
      subjectId: SEASON_CHAMPION_CREST_SLUG,
      payload: {
        v: 1,
        crest_slug: SEASON_CHAMPION_CREST_SLUG,
        title: "Champion of the Season",
        season_id: seasonId,
        rank: champion.rank,
      },
    });
  }

  return granted;
}
