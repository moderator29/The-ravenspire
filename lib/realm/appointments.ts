import "server-only";
import { realmWeek } from "@/lib/realm/period";
import { DAILY_SOCIAL_RENOWN_CAP } from "@/lib/economy/allowances";

/* THE REALM'S CLOCK.
 *
 * WHY THIS EXISTS
 * Nothing in Ravenspire happens at a time. A member can do every act in the
 * product at three in the morning on a Tuesday, and the product will look
 * exactly the same as it did yesterday and exactly the same as it will
 * tomorrow. That is the single biggest retention hole in it: there has never
 * been a reason to come back on a particular day, because no particular day
 * has ever been different from any other.
 *
 * Three appointments, in ascending period, all decided here and only here:
 *
 *   The Muster    twice a day, two hours each. The reason to open the app.
 *   The Clash     once a week, Friday evening to Sunday evening. The reason
 *                 to seal a Call before the weekend.
 *   The Season    the close. The reason any of it accumulates.
 *
 * WHY IT IS PURE, AND WHY IT IS SERVER-ONLY
 * Pure because a clock is exactly the kind of logic that is impossible to
 * test through a route and trivial to test on its own: no database, no random
 * number generator, and no `new Date()` that a test cannot control. Every
 * function here takes the instant it is reasoning about.
 *
 * Server-only because the browser's clock belongs to the member. A window that
 * a client decides is a window a client can move by changing its system time,
 * and the whole point of an appointment is that the realm chose when. The
 * routes send the member absolute timestamps and the server's own `now`, and
 * the surfaces render a countdown against the skew they measured once. A
 * browser that is an hour fast can therefore mis-render a label and can never
 * claim a Muster outside its window.
 */

/* ============================================================
   1. THE MUSTER, the daily window
   ============================================================

   WHAT IT IS
   Two two-hour windows a day, twelve hours apart. A member who opens the app
   inside either one claims the day's Muster: once per UTC day, either window,
   never twice.

   WHY TWO WINDOWS AND NOT ONE
   One realm-wide window is the mechanic that makes an appointment worth
   anything: everybody is present at the same time, which is the difference
   between a daily bonus and an event. But a single fixed UTC window
   permanently excludes whole hemispheres, and "come back daily, at four in the
   morning" is not an offer. Two windows twelve hours apart cost nothing,
   because the claim is still once a day, and they put a window inside every
   member's waking hours wherever they live. That last claim is asserted at
   module load against every whole-hour UTC offset on earth rather than
   asserted in a comment, because it is the one property of this schedule that
   a well-meaning tweak to the hours would silently destroy.

   WHY NOT A WINDOW ANCHORED TO THE MEMBER
   A per-member window would solve the timezone problem completely and would
   also destroy the entire value of the mechanic. If everyone's window is
   different then nobody is ever present at the same time as anybody else, and
   what is left is a daily bonus with extra steps. */

/* The UTC hours the Muster opens. Twelve apart, deliberately. */
export const MUSTER_HOURS_UTC = [1, 13] as const;

/* How long a window stays open. Two hours is long enough that a member who
   glances at their phone inside a normal evening catches it, and short enough
   that it is still an appointment rather than a quarter of the day. */
export const MUSTER_WINDOW_HOURS = 2;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface MusterWindow {
  /* The UTC day this window belongs to, YYYY-MM-DD. This is the claim key: a
     member claims a DAY, not a window, so catching the second window after
     missing the first is the same claim. */
  day: string;
  /* Which of the day's windows, 0 based, for the copy that names it. */
  index: number;
  opensAt: Date;
  closesAt: Date;
}

function utcMidnight(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  );
}

function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/* Every window of the UTC day containing `at`, in order. */
export function musterWindowsOn(at: Date): MusterWindow[] {
  const midnight = utcMidnight(at).getTime();
  const day = dayKey(new Date(midnight));
  return MUSTER_HOURS_UTC.map((hour, index) => ({
    day,
    index,
    opensAt: new Date(midnight + hour * HOUR_MS),
    closesAt: new Date(midnight + (hour + MUSTER_WINDOW_HOURS) * HOUR_MS),
  }));
}

/* The window that is open right now, or null. Half open on purpose: a member
   arriving on the closing second is late, and a window that included both ends
   would overlap the next one if the hours were ever brought closer together. */
export function currentMuster(at: Date): MusterWindow | null {
  const t = at.getTime();
  for (const w of musterWindowsOn(at)) {
    if (t >= w.opensAt.getTime() && t < w.closesAt.getTime()) return w;
  }
  return null;
}

/* The next window that has not opened yet. Always exists: if today's are all
   past, it is tomorrow's first. Never returns the window currently open,
   because "next" is what a member is waiting for and they are not waiting for
   the one they are standing in. */
export function nextMuster(at: Date): MusterWindow {
  const t = at.getTime();
  for (const w of musterWindowsOn(at)) {
    if (w.opensAt.getTime() > t) return w;
  }
  return musterWindowsOn(new Date(utcMidnight(at).getTime() + DAY_MS))[0];
}

/* ------------------------------------------------------------
   The vigil, and what a day of it pays
   ------------------------------------------------------------

   WHY THE MUSTER PAYS FROM AN ALLOWANCE THAT ALREADY EXISTS
   This is the whole economic answer and it is worth stating plainly, because
   the obvious design is wrong in a way that takes a year to show up.

   Glory is not a private score. public.award_capped adds every point of Glory
   to the member's Renown as well, and Renown never falls. So a daily
   attendance reward paid in fresh Glory mints PERMANENT standing every single
   day, forever, for doing nothing but opening an app. At even a modest sixty a
   day that is twenty two thousand Renown a year, which walks past the King
   tier at fifteen thousand without a member ever making a Call, winning a duel
   or fighting a battle. Every ladder in the realm would end up sorted by
   attendance.

   So the Muster mints nothing. It is paid through public.award_capped under
   the SAME 'social' category, and therefore out of the SAME two hundred a day
   ceiling, that likes, comments, cheers and quests already spend. The realm's
   total Renown mint per member per day does not rise by one point. What the
   Muster changes is WHEN a member spends an allowance they already had.

   The honest consequence, which the surface says out loud rather than hiding:
   a member who has already spent their day's allowance is paid nothing by the
   Muster. That is correct. They have already earned their day. The Muster is
   for the member who would otherwise not have come at all.

   WHAT IS ACTUALLY EARNED IN THE WINDOW, THEN
   The vigil. A server-kept count of consecutive days mustered INSIDE a window,
   which no amount of scrolling at other hours can produce, and which pays out
   in the one currency the realm can mint forever without inflating anything:
   a crest. `lord-of-light` has sat in the crest catalogue since launch reading
   "for unbroken daily devotion to the realm" with nothing anywhere in the
   product able to grant it. The Muster is its producer. A badge costs the
   realm nothing, cannot be farmed into a ladder, and is the only reward an
   attendance mechanic should ever pay. */

/* What a first day pays. */
export const MUSTER_BASE_GLORY = 20;
/* What each further consecutive day adds, until the plateau. */
export const MUSTER_STREAK_GLORY = 5;
/* The ceiling. A vigil past this pays the ceiling and nothing more: the
   streak itself, and the crest at the end of it, are what the later days buy. */
export const MUSTER_MAX_GLORY = 60;

/* The consecutive day on which the ceiling is first reached. Derived, never
   typed, so it cannot drift away from the three numbers above. */
export const MUSTER_PLATEAU_DAY =
  (MUSTER_MAX_GLORY - MUSTER_BASE_GLORY) / MUSTER_STREAK_GLORY + 1;

/* The vigil that earns `lord-of-light`. Thirty consecutive days of catching a
   two hour window is a genuinely hard thing to do and an entirely fair one:
   it needs no money, no followers and no luck, only turning up. */
export const VIGIL_CREST_DAYS = 30;
export const VIGIL_CREST_SLUG = "lord-of-light";

/* Glory for a vigil of `streak` consecutive days, where the day being claimed
   is the streak's last. Pure, and the server is the only caller. */
export function musterGlory(streak: number): number {
  if (!Number.isFinite(streak) || streak < 1) return 0;
  return Math.min(
    MUSTER_BASE_GLORY + MUSTER_STREAK_GLORY * (Math.floor(streak) - 1),
    MUSTER_MAX_GLORY
  );
}

/* The vigil after claiming `today`, given the day last claimed.
 *
 * Same shape as the plain attendance streak in /api/streak, and deliberately a
 * SEPARATE count rather than a reuse of it. They measure different things:
 * that one is "did you show up", this one is "were you here when the realm
 * was". Paying the second on the first would hand a member who has never
 * caught a window a thirty day vigil crest for scrolling. */
export function advanceVigil(
  lastDay: string | null,
  today: string,
  currentStreak: number
): number {
  if (lastDay === today) return Math.max(1, Math.floor(currentStreak));
  const yesterday = dayKey(new Date(Date.parse(`${today}T00:00:00.000Z`) - DAY_MS));
  if (lastDay === yesterday) return Math.max(1, Math.floor(currentStreak)) + 1;
  /* First ever, or a broken vigil. Either way today is day one. */
  return 1;
}

/* ============================================================
   2. THE CLASH, the weekly window
   ============================================================

   WHAT IT IS
   House Clashes shipped with a table, an admin authoring form and a live
   scoreboard, and no schedule at all. Every one of them had to be typed by a
   steward, which meant in practice that none of them ever existed: the table
   is empty in production to this day. A competition that happens when somebody
   remembers to start it is not a competition, it is an intention.

   The cadence: the Clash of week N opens on that ISO week's FRIDAY at 18:00
   UTC and closes on the SUNDAY at 18:00 UTC. Forty eight hours, which is the
   length a Clash has always been (CLASH_HOURS in the clashes route), moved off
   a steward's whim and onto the calendar.

   WHY FRIDAY EVENING TO SUNDAY EVENING
   The window has to contain a weekend for a realm that is spread across every
   timezone, and it has to contain both weekend days for a realm where half the
   members are twelve hours from the other half. Friday 18:00 UTC is Friday
   evening in Europe, Friday afternoon in the Americas and Saturday morning in
   Asia and Oceania. Every member gets two of their own weekend days inside it.

   WHY THE ROW IS WRITTEN ON THE MONDAY
   The Clash exists as a database row from the Monday of its own week, four
   days before it opens. A countdown a member cannot see until the moment it
   starts is not a countdown, and a Clash needs the days beforehand for anyone
   to plan a Call into it. */

/* When the weekly Clash opens, as an ISO weekday (Monday 1 to Sunday 7) and a
   UTC hour. */
export const CLASH_OPEN_ISO_DAY = 5;
export const CLASH_OPEN_HOUR_UTC = 18;
/* Unchanged from the day Clashes shipped. A Clash is a 48 hour window. */
export const CLASH_HOURS = 48;

export interface ClashWindow {
  /* The ISO week key, YYYY-Www. This is the scheduler's idempotency key: one
     scheduled Clash per ISO week, enforced by a unique index rather than by a
     read-then-write that a re-run would race. */
  week: string;
  opensAt: Date;
  closesAt: Date;
}

/* The Monday 00:00 UTC of the ISO week containing `at`. */
export function isoWeekMonday(at: Date): Date {
  const d = utcMidnight(at);
  /* getUTCDay is 0 for Sunday; ISO numbers Monday 1 through Sunday 7. */
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (isoDay - 1));
  return d;
}

/* The Clash window of the ISO week containing `at`, whatever phase it is in. */
export function clashWindowOfWeek(at: Date): ClashWindow {
  const monday = isoWeekMonday(at).getTime();
  const opensAt = new Date(
    monday + (CLASH_OPEN_ISO_DAY - 1) * DAY_MS + CLASH_OPEN_HOUR_UTC * HOUR_MS
  );
  return {
    /* Read off the opening instant rather than off `at`. They are the same ISO
       week by construction, and taking it from the instant the row will carry
       means the key can never disagree with the window it names. */
    week: realmWeek(opensAt),
    opensAt,
    closesAt: new Date(opensAt.getTime() + CLASH_HOURS * HOUR_MS),
  };
}

export type ClashPhase = "upcoming" | "live" | "closed";

export function clashPhase(window: ClashWindow, at: Date): ClashPhase {
  const t = at.getTime();
  if (t < window.opensAt.getTime()) return "upcoming";
  if (t < window.closesAt.getTime()) return "live";
  return "closed";
}

/* The next Clash a member could still enter: this week's if it has not closed,
   otherwise next week's. It is what the countdown on the Houses surface is
   drawn from, and it is the single window the scheduler ensures a row for.
 *
 * WHY ONE WINDOW AND NOT A BACKFILL
 * A scheduled job has to be safe to miss a run, and the obvious way to get
 * that is to write every week the job was down for. It is the wrong way here:
 * a Clash for a week that has already closed is a competition nobody could
 * enter, and settling it would freeze an empty board and announce a Clash that
 * never happened. Because this always returns a window that is still open or
 * still coming, a job that has been down for a month comes back and opens
 * exactly one Clash, the real one.
 *
 * A job that comes back DURING a live window still gets it right, and that is
 * a property of the Clash design rather than of this function: entries are
 * derived from posts.created_at inside the window rather than recorded when
 * the Clash opens, so a row written an hour after its own start counts every
 * Call made in that hour. The Clash is retroactively correct. */
export function nextClashWindow(at: Date): ClashWindow {
  const thisWeek = clashWindowOfWeek(at);
  if (at.getTime() < thisWeek.closesAt.getTime()) return thisWeek;
  return clashWindowOfWeek(new Date(thisWeek.closesAt.getTime() + DAY_MS));
}

/* ============================================================
   3. THE SEASON, the close
   ============================================================

   The season already has a start, an end and a settlement table. What it has
   never had is anything that notices the end arriving. `status` moved from
   'active' to 'settled' only when a steward pressed a button, so a season that
   ended on a Sunday stayed open until somebody remembered, and every Call
   settled in between was scored into a season that was supposed to be over.

   The rest of the close (what banks, what resets, what a member keeps) lives
   in public.close_season, because freezing a member's Glory and resetting it
   are two halves of one indivisible act. This is only the question of whether
   the moment has come, which is a clock question and belongs here. */

export interface SeasonClock {
  id: number;
  status: string;
  ends_at: string | null;
}

/* True when a season's own end has passed and it is still open.
 *
 * Deliberately refuses a null or unparseable `ends_at` rather than treating an
 * absent end as one long past. The column is NOT NULL in the schema, so this
 * is a guard against the shape rather than against the data: the value reaches
 * here through PostgREST as `string | null`, and the one direction this
 * function must never fail in is closing a live season early on every member
 * in it because a field arrived missing or malformed. Refusing costs a delayed
 * close that a steward can force by hand. Guessing costs a season. */
export function seasonDueToClose(season: SeasonClock, at: Date): boolean {
  if (season.status !== "active") return false;
  if (!season.ends_at) return false;
  const ends = Date.parse(season.ends_at);
  if (!Number.isFinite(ends)) return false;
  return ends <= at.getTime();
}

/* How many of a settled season's top ranks earn `champion-of-the-season`.
 *
 * The podium, not the winner alone: the crest catalogue has always read "for
 * those who stood highest when the Season closed", plural, and a season with
 * exactly one prize is a season five sixths of the realm stops watching in
 * week two. */
export const SEASON_CHAMPION_RANKS = 3;
export const SEASON_CHAMPION_CREST_SLUG = "champion-of-the-season";

/* ============================================================
   4. THE ASSERTIONS
   ============================================================

   Every one of these is a property of the schedule that is true today, that
   nothing else in the product checks, and that a reasonable-looking edit to
   the constants above would quietly break. They run at module load, so a bad
   schedule fails the build and the test run rather than reaching a member.
   Same posture as lib/collectibles/crafting.ts, for the same reason: a rule
   argued in a comment is a rule that is one refactor from being false. */

function assertSchedule() {
  /* 1. The plateau has to land on a whole day. If the ceiling is not a whole
        number of steps above the base, the last raise before the plateau is a
        stub of a few Glory and the ladder reads as a rounding error. */
  const rise = MUSTER_MAX_GLORY - MUSTER_BASE_GLORY;
  if (rise < 0 || rise % MUSTER_STREAK_GLORY !== 0) {
    throw new Error(
      `Muster ceiling ${MUSTER_MAX_GLORY} is not a whole number of ${MUSTER_STREAK_GLORY} steps above ${MUSTER_BASE_GLORY}`
    );
  }

  /* 2. Showing up may never be worth more than half a day's social allowance.
        The Muster spends that allowance rather than adding to it (see the long
        note above), so a ceiling near the cap would mean a member who opens
        the app inside the window has already spent most of their day and gets
        nothing for anything they then actually do. The appointment is supposed
        to bring people to the realm, not to replace it. */
  if (MUSTER_MAX_GLORY * 2 > DAILY_SOCIAL_RENOWN_CAP) {
    throw new Error(
      `Muster ceiling ${MUSTER_MAX_GLORY} takes more than half the ${DAILY_SOCIAL_RENOWN_CAP} daily social allowance`
    );
  }

  /* 3. No window may straddle a UTC day boundary, and no two may overlap.
        The claim key is the UTC day, so a window running past midnight would
        be claimable as two different days, and two overlapping windows would
        make "the window you are in" ambiguous. */
  const sorted = [...MUSTER_HOURS_UTC].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] < 0 || sorted[i] + MUSTER_WINDOW_HOURS > 24) {
      throw new Error(`Muster window at ${sorted[i]}:00 UTC crosses a day boundary`);
    }
    if (i > 0 && sorted[i - 1] + MUSTER_WINDOW_HOURS > sorted[i]) {
      throw new Error(
        `Muster windows at ${sorted[i - 1]}:00 and ${sorted[i]}:00 UTC overlap`
      );
    }
  }

  /* 4. Every inhabited timezone must get a window at a civilised local hour.
        This is the property that justifies having two windows at all, and it
        is exactly the property a well-meaning "let us move it an hour later"
        would destroy for one hemisphere without anybody noticing, because the
        people it excludes are asleep and do not file bugs.

        Checked against every whole-hour UTC offset in use on earth, from
        Baker Island at -12 to Kiritimati at +14. Waking hours are taken as
        07:00 up to but not including 23:00 local. Half-hour and quarter-hour
        zones (India at +5:30, Nepal at +5:45, Chatham at +12:45) are covered
        by the whole hours either side of them: a window that opens at a good
        hour for +5 and +6 opens thirty minutes off that for +5:30. */
  for (let offset = -12; offset <= 14; offset += 1) {
    const reachable = MUSTER_HOURS_UTC.some((hour) => {
      const local = ((hour + offset) % 24 + 24) % 24;
      return local >= 7 && local < 23;
    });
    if (!reachable) {
      throw new Error(
        `No Muster window falls in waking hours at UTC${offset >= 0 ? "+" : ""}${offset}`
      );
    }
  }

  /* 5. The Clash must open on a real ISO weekday and close inside a week, or
        two consecutive Clashes would overlap and one Call would count twice. */
  if (CLASH_OPEN_ISO_DAY < 1 || CLASH_OPEN_ISO_DAY > 7) {
    throw new Error(`Clash opens on ISO day ${CLASH_OPEN_ISO_DAY}, which is not a day`);
  }
  const openOffsetHours = (CLASH_OPEN_ISO_DAY - 1) * 24 + CLASH_OPEN_HOUR_UTC;
  if (openOffsetHours + CLASH_HOURS > 7 * 24) {
    throw new Error(
      `A ${CLASH_HOURS} hour Clash opening on ISO day ${CLASH_OPEN_ISO_DAY} at ${CLASH_OPEN_HOUR_UTC}:00 runs into the next week's`
    );
  }
}

assertSchedule();
