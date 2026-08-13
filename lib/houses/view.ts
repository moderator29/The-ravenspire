/* Shapes the House surfaces read, and the two bits of formatting they share.

   Client safe on purpose: lib/houses/oath.ts and lib/houses/scoring.ts are
   `import "server-only"` because they reach the ledger and the oath history,
   so the pages cannot import their types. These mirror what the routes
   actually return. */

export interface MemberIdentityView {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  renown: number;
  is_agent: boolean;
}

export interface HouseLevelView {
  level: number;
  floor: number;
  next: number;
  progress: number;
  cumulative?: number;
}

export interface HouseStandingRow {
  slug: string;
  rank: number;
  score: number;
  mean: number;
  contributor_count: number;
  member_count: number;
  counted: number;
  rival: { slug: string; gap: number; ahead: boolean } | null;
  level: HouseLevelView;
  cumulative: number;
}

export interface BoardEntry {
  rank: number;
  profile_id: string;
  contribution: number;
  counts: boolean;
  role: string;
  member: MemberIdentityView | null;
}

export interface RosterEntryView {
  profile_id: string;
  role: string;
  sworn_at: string;
  season_id: number | null;
  contribution: number;
  member: MemberIdentityView | null;
}

export interface PastMemberView {
  profile_id: string;
  span: string;
  left_at: string | null;
  member: MemberIdentityView | null;
}

/* One perk in the hall's catalogue, priced against this House's real sworn
   count. `price` is what the server will charge, not an estimate. */
export interface PerkOfferView {
  slug: string;
  name: string;
  blurb: string;
  effect: string;
  icon: string;
  duration_days: number;
  price: number;
  affordable: boolean;
  burning: boolean;
}

export interface TreasuryEntryView {
  delta: number;
  reason: string;
  ref: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface HouseTreasuryView {
  /* Real POINTS, from real sinks. Zero for a House that has never had a stake
     burn under its banner, and rendered as zero. */
  balance: number;
  sworn: number;
  catalogue: PerkOfferView[];
  active: {
    slug: string;
    cost: number;
    starts_at: string;
    expires_at: string;
    allowance_remaining: number | null;
    actor_id: string | null;
  }[];
  history: {
    slug: string;
    cost: number;
    starts_at: string;
    expires_at: string;
    allowance_remaining: number | null;
    actor_id: string | null;
  }[];
  ledger: TreasuryEntryView[];
  /* Whether the member reading this may open the treasury. Presentation only:
     the real check is inside spend_house_treasury. */
  may_spend: boolean;
  viewer_role: string | null;
  /* Does the cached balance still agree with the ledger under it.

     `houses.treasury` is a cached total and house_treasury_ledger is the source
     of truth, which is the same shape profiles.points and points_ledger have,
     and the same shape that drifts in silence when nothing compares the two.
     A House's members fund this balance, so they are the people entitled to
     know when it stops adding up. `known` is false when the sum could not be
     taken at all, which renders as nothing rather than as agreement: a tick
     nobody checked is worse than no tick. */
  reconciled: boolean;
  reconciliation_known: boolean;
  reconciliation_drift: number;
  /* What the endowment costs and what a member may still give today. Present
     for a signed in member sworn to this House, null otherwise: a reader who
     cannot give is not shown a control. */
  endowment: HouseEndowmentView | null;
}

/* The terms of a gift, priced for the member reading them. Every figure is the
   figure the server will charge, never an estimate. */
export interface HouseEndowmentView {
  /* Whether endowment_live is on. The terms are readable either way, the same
     posture the Bazaar takes with its fee. */
  open: boolean;
  min: number;
  daily_cap: number;
  /* This member's own position: their balance, what they have already given
     today across every House, and the largest gift the realm would take from
     them right now. `max` is zero rather than a control that moves and then
     refuses. */
  balance: number;
  given_today: number;
  max: number;
}

export interface HouseHall {
  house: {
    slug: string;
    name: string;
    motto: string;
    sigil: string;
    color: string;
    desc: string;
  };
  season: { id: number; name: string; ends_at: string } | null;
  offSeason: boolean;
  standing: {
    rank: number;
    score: number;
    mean: number;
    contributor_count: number;
    member_count: number;
    counted: number;
    top_n: number;
  };
  rival: {
    slug: string;
    name: string;
    color: string | null;
    gap: number;
    ahead: boolean;
    score: number;
  } | null;
  level: HouseLevelView;
  treasury: HouseTreasuryView;
  board: BoardEntry[];
  roster: RosterEntryView[];
  past: PastMemberView[];
}

export interface ClashHouseRow {
  slug: string;
  name: string;
  color: string;
  score: number;
  mean: number;
  calls: number;
  hits: number;
  open: number;
  contributor_count: number;
  rank: number;
}

export interface ClashContributorRow {
  profile_id: string;
  house_slug: string;
  house_name: string;
  glory: number;
  calls: number;
  hits: number;
  misses: number;
  open: number;
  member: MemberIdentityView | null;
}

export interface ClashRow {
  id: string;
  title: string;
  token: string | null;
  theme: string | null;
  starts_at: string;
  ends_at: string;
  season_id: number | null;
  phase: "upcoming" | "live" | "closed";
  /* The ISO week the calendar opened this Clash for. Null for one a steward
     called by hand, which is still allowed and sits beside the weekly one. */
  scheduled_week: string | null;
  /* Set once the result has been frozen into house_clash_results. A closed
     Clash that is not settled has closed but has no result yet, and the two
     are different things a surface has to be able to tell apart. */
  settled_at: string | null;
  houses: ClashHouseRow[];
  contributors: ClashContributorRow[];
}

/* The weekly cadence, sent whether or not a row exists for the next window.
 *
 * "Clashes open every Friday evening and run for 48 hours" is a rule the realm
 * operates by, not a record of something that happened, so publishing it on an
 * empty surface is not inventing data. `scheduled` is the honest other half:
 * false means the window is due and its row has not been written yet, and the
 * surface says exactly that rather than showing a countdown to a Clash that
 * does not exist. */
export interface ClashCadence {
  week: string;
  opensAt: string;
  closesAt: string;
  hours: number;
  now: string;
  scheduled: boolean;
}

export interface OathEntryView {
  id: string;
  house_slug: string;
  house_name: string;
  color: string | null;
  role: string;
  span: string;
  sworn_at: string;
  left_at: string | null;
  season_id: number | null;
  left_season_id: number | null;
  current: boolean;
}

/* How long is left, in the coarsest honest unit. Never counts past a close. */
function remaining(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3.6e6);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hours left`;
  return `${Math.max(1, Math.floor(ms / 6e4))} minutes left`;
}

export function seasonCountdown(endsAt: string): string {
  return remaining(endsAt) ?? "closed";
}

export function clashCountdown(clash: {
  phase: string;
  starts_at: string;
  ends_at: string;
}): string {
  if (clash.phase === "live") return remaining(clash.ends_at) ?? "closing";
  if (clash.phase === "upcoming") {
    const until = remaining(clash.starts_at);
    return until ? `opens in ${until.replace(" left", "")}` : "opening";
  }
  return `closed ${new Date(clash.ends_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`;
}

/* When the next window opens, against the server's own clock rather than the
   browser's. The offset between the two is measured once from the `now` the
   route sent, so a member whose machine is minutes out still reads the right
   figure. It can only ever be a label: nothing about a Clash is decided here. */
export function cadenceCountdown(cadence: ClashCadence): string {
  const skew = Date.parse(cadence.now) - Date.now();
  const at = Date.now() + (Number.isFinite(skew) ? skew : 0);

  const opens = Date.parse(cadence.opensAt);
  const closes = Date.parse(cadence.closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return "";

  if (at >= opens && at < closes) {
    const left = closes - at;
    const hours = Math.floor(left / 3.6e6);
    if (hours >= 1) return `running, ${hours} ${hours === 1 ? "hour" : "hours"} left`;
    return `running, ${Math.max(1, Math.floor(left / 6e4))} minutes left`;
  }

  const until = opens - at;
  if (until <= 0) return "opening";
  const hours = Math.floor(until / 3.6e6);
  if (hours >= 48) return `opens in ${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `opens in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `opens in ${Math.max(1, Math.floor(until / 6e4))} minutes`;
}

/* Where a House sits on live Glory, and who it is closest to.

   The realm strip and the Herald's digest both answer "where is my House and
   who is nearest", and both answered it with their own copy of the same twenty
   lines. Two copies of a ranking rule is two places for it to disagree about
   which rival to name, which is the one thing a member would notice.

   `ahead` reads from the member's side: true means that House is ahead of
   yours. lib/houses/scoring.ts carries a rivalOf() with a field of the same
   name meaning the opposite, over a different score entirely (season
   contributions rather than the live Glory column). They are not
   interchangeable and neither call site can use the other. */
export interface GloryStanding {
  slug: string;
  name: string;
  rank: number;
  /* How many Houses there are, so a rank can be stated as "3 of 6". */
  of: number;
  glory: number;
  rival: { name: string; gap: number; ahead: boolean } | null;
}

/* `rows` must already be sorted by Glory, best first: the caller reads them in
   that order from the database and the rank is the position. */
export function gloryStanding(
  rows: readonly { slug: string; name: string; glory: number | null }[],
  slug: string | null
): GloryStanding | null {
  if (!slug) return null;
  const index = rows.findIndex((h) => h.slug === slug);
  if (index < 0) return null;

  const mine = rows[index]!;
  const above = index > 0 ? rows[index - 1]! : null;
  const below = index < rows.length - 1 ? rows[index + 1]! : null;

  /* Whoever is closest. Being 40 behind the House above is a better story than
     being 900 ahead of the House below. */
  const gapAbove = above ? (above.glory ?? 0) - (mine.glory ?? 0) : null;
  const gapBelow = below ? (mine.glory ?? 0) - (below.glory ?? 0) : null;
  let rival: { name: string; gap: number; ahead: boolean } | null = null;
  if (gapAbove !== null && (gapBelow === null || gapAbove <= gapBelow)) {
    rival = { name: above!.name, gap: gapAbove, ahead: true };
  } else if (gapBelow !== null) {
    rival = { name: below!.name, gap: gapBelow, ahead: false };
  }

  return {
    slug: mine.slug,
    name: mine.name,
    rank: index + 1,
    of: rows.length,
    glory: mine.glory ?? 0,
    rival,
  };
}
