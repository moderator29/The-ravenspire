import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* The oath system (V2 section 11.1).

   An oath is not a profile field, it is a dated commitment with a beginning
   and, sometimes, an end. house_members holds the whole history; this module
   holds the rules that govern writing to it.

   The four rules, and why each one exists:

   1. Switching is allowed only in the off-season window. Without this,
      everyone defects to the winning House on the final day, and the underdog
      story becomes impossible: helping an underdog rise has to mean committing
      early, while it is still a risk.
   2. Global Renown stays. It is personal legacy and is never taken away.
   3. House contribution resets to zero under the new banner, and the
      contribution already made stays with the House that earned it, forever.
      This one is enforced by the data model rather than by code: contribution
      is derived by joining points_ledger against the oath window that
      contained each row (see house_season_contributions), so nothing is moved
      and nothing can be moved.
   4. One season of cooldown before switching again, so the oath is a
      commitment rather than a dial. */

export interface SeasonRow {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface OathRow {
  id: string;
  profile_id: string;
  house_slug: string;
  role: string;
  sworn_at: string;
  left_at: string | null;
  season_id: number | null;
  left_season_id: number | null;
}

/* Where the realm stands on the calendar right now. */
export interface SeasonWindow {
  /* The season currently running, if one is. */
  active: SeasonRow | null;
  /* The season an oath sworn right now would count toward. */
  upcoming: SeasonRow | null;
  /* The most recent season that has actually started. This is the one the
     standings describe, in season and out. */
  latest: SeasonRow | null;
  /* True when no season is running, which is when oaths may be sworn. */
  offSeason: boolean;
  /* The id a new oath is stamped with. Never null: with no seasons defined at
     all, the realm has not started keeping time and the oath is stamped with
     nothing rather than a fabricated season. */
  nextSeasonId: number | null;
}

export async function loadSeasonWindow(
  db: SupabaseClient
): Promise<SeasonWindow> {
  const { data } = await db
    .from("seasons")
    .select("id, name, starts_at, ends_at, status")
    .order("id", { ascending: true });

  const seasons = (data ?? []) as SeasonRow[];
  const now = Date.now();

  /* Active means both flagged active and genuinely inside its window. A season
     someone forgot to close is not an excuse to lock the oath forever. */
  const active =
    seasons.find(
      (s) =>
        s.status === "active" &&
        Date.parse(s.starts_at) <= now &&
        Date.parse(s.ends_at) > now
    ) ?? null;

  const upcoming =
    seasons.find((s) => Date.parse(s.starts_at) > now) ?? null;

  const started = seasons.filter((s) => Date.parse(s.starts_at) <= now);
  const latest = started.length > 0 ? started[started.length - 1] : null;

  const maxId = seasons.reduce((max, s) => Math.max(max, s.id), 0);

  return {
    active,
    upcoming,
    latest,
    offSeason: active === null,
    nextSeasonId: upcoming
      ? upcoming.id
      : seasons.length > 0
        ? maxId + 1
        : null,
  };
}

const OATH_SELECT =
  "id, profile_id, house_slug, role, sworn_at, left_at, season_id, left_season_id";

/* Every oath a member has sworn, oldest first. This is the public history. */
export async function loadOathHistory(
  db: SupabaseClient,
  profileId: string
): Promise<OathRow[]> {
  const { data } = await db
    .from("house_members")
    .select(OATH_SELECT)
    .eq("profile_id", profileId)
    .order("sworn_at", { ascending: true });
  return (data ?? []) as OathRow[];
}

export function currentOath(history: OathRow[]): OathRow | null {
  return history.find((o) => o.left_at === null) ?? null;
}

/* The season an oath sworn now would be eligible for, given the member's
   history. A founding oath (their first) carries no cooldown: it was taken at
   onboarding, before the member knew what any of this meant. Every oath after
   it costs a full season, so the earliest a switcher may swear again is two
   seasons after the one they switched into. */
export function earliestSwitchSeason(history: OathRow[]): number | null {
  const current = currentOath(history);
  if (!current || current.season_id === null) return null;
  const isFoundingOath = history.length <= 1;
  return current.season_id + (isFoundingOath ? 1 : 2);
}

export type OathBlockReason =
  | "no_current_oath"
  | "in_season"
  | "cooldown"
  | "same_house"
  | "no_calendar";

export interface OathEligibility {
  /* Can this member swear a new oath at this moment? */
  allowed: boolean;
  reason: OathBlockReason | null;
  window: SeasonWindow;
  history: OathRow[];
  current: OathRow | null;
  /* The season a new oath would count toward. */
  seasonId: number | null;
  /* The first season this member may switch into. */
  earliestSeason: number | null;
}

export async function oathEligibility(
  db: SupabaseClient,
  profileId: string
): Promise<OathEligibility> {
  const [window, history] = await Promise.all([
    loadSeasonWindow(db),
    loadOathHistory(db, profileId),
  ]);
  const current = currentOath(history);
  const earliestSeason = earliestSwitchSeason(history);
  const seasonId = window.nextSeasonId;

  const base = { window, history, current, seasonId, earliestSeason };

  if (!current) {
    /* No open oath means this member never took one, and swearing the first
       one belongs to onboarding, not here. */
    return { allowed: false, reason: "no_current_oath", ...base };
  }
  if (!window.offSeason) {
    return { allowed: false, reason: "in_season", ...base };
  }
  if (seasonId === null) {
    return { allowed: false, reason: "no_calendar", ...base };
  }
  if (earliestSeason !== null && seasonId < earliestSeason) {
    return { allowed: false, reason: "cooldown", ...base };
  }
  return { allowed: true, reason: null, ...base };
}

/* Copy for a refusal. Written so the member learns the rule rather than only
   that they were stopped. */
export function blockMessage(
  reason: OathBlockReason,
  e: OathEligibility
): string {
  switch (reason) {
    case "in_season":
      return `A season is running. Oaths may only be sworn between seasons, so no one can defect to the winning House at the death. ${
        e.window.active ? `${e.window.active.name} closes ` : "The season closes "
      }${
        e.window.active
          ? new Date(e.window.active.ends_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
            })
          : "soon"
      }.`;
    case "cooldown":
      return `You swore your current oath for Season ${e.current?.season_id}. An oath costs a full season of cooldown, so the earliest you may swear again is Season ${e.earliestSeason}.`;
    case "same_house":
      return "You are already sworn to that House.";
    case "no_current_oath":
      return "You hold no oath yet. Choose your House when the Maester welcomes you.";
    case "no_calendar":
      return "The realm keeps no season calendar yet, so there is no season to swear for.";
  }
}

/* Render one oath as a line of history, e.g. "Season 1 to 3" or
   "Season 4 to present". A season-less oath says so honestly rather than
   inventing a number. */
export function oathSpan(oath: OathRow): string {
  if (oath.season_id === null) return "before the seasons were kept";
  if (oath.left_at === null) return `Season ${oath.season_id} to present`;
  const end = oath.left_season_id ?? oath.season_id;
  if (end === oath.season_id) return `Season ${oath.season_id}`;
  return `Season ${oath.season_id} to ${end}`;
}
