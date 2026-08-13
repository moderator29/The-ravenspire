import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_SOCIAL_RENOWN_CAP } from "@/lib/economy/allowances";
import { checkAndGrantCrests } from "@/lib/crests";
import {
  MUSTER_BASE_GLORY,
  MUSTER_MAX_GLORY,
  MUSTER_STREAK_GLORY,
  VIGIL_CREST_DAYS,
  currentMuster,
  musterGlory,
  nextMuster,
} from "@/lib/realm/appointments";

/* The Muster, as the routes see it.
 *
 * One module so that the strip read and the claim write cannot form two
 * opinions about whether a window is open. Both call in here, both get the
 * state from the same function, and the server's clock is the only clock
 * either of them consults. */

export interface MusterState {
  /* Whether a window is open right now. Decided from the server clock, never
     from anything the client sent. */
  open: boolean;
  /* The window in question: the one that is open, or the next one to open.
     Absolute instants, so a surface can render a countdown without having to
     agree with the server about what time it is. */
  opensAt: string;
  closesAt: string;
  /* The server's own now, sent so a surface can measure its own skew once and
     count down against that rather than against a browser clock that may be
     minutes out. A skewed browser can then mis-render a label, and can still
     never claim outside a window, because the claim is decided here. */
  now: string;
  /* Whether this member has already claimed the current UTC day. Null when
     nobody is signed in. */
  claimed: boolean | null;
  /* The member's vigil: consecutive days mustered inside a window. */
  vigil: number | null;
  best: number | null;
  /* What the NEXT claim is worth, before the daily social allowance is
     applied. Shown so the offer is legible before it is taken. */
  nextGlory: number | null;
  /* How many consecutive days earn the vigil crest, and whether it is held. */
  crestAt: number;
  crestHeld: boolean | null;
}

interface MusterProfileRow {
  muster_day: string | null;
  muster_streak: number | null;
  muster_best: number | null;
}

/* The realm day the claim is keyed on: the UTC day of the window, which for
   every configured window is the UTC day of the instant, because no window is
   allowed to straddle midnight (asserted in lib/realm/appointments.ts). */
function claimDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/* Read the member's vigil. Separate from the state builder so the claim route
   can reuse it without a second copy of the column list. */
export async function readVigil(
  db: SupabaseClient,
  profileId: string
): Promise<MusterProfileRow> {
  const { data } = await db
    .from("profiles")
    .select("muster_day, muster_streak, muster_best")
    .eq("id", profileId)
    .maybeSingle();
  return {
    muster_day: (data?.muster_day as string | null) ?? null,
    muster_streak: (data?.muster_streak as number | null) ?? 0,
    muster_best: (data?.muster_best as number | null) ?? 0,
  };
}

/* What the surfaces render. `profileId` null builds the anonymous half: the
   window is a fact about the realm and is told to everyone, and everything
   personal comes back null so a signed out visitor is never shown a vigil of
   zero as though it were theirs. */
export async function musterState(
  db: SupabaseClient,
  profileId: string | null,
  at: Date = new Date()
): Promise<MusterState> {
  const open = currentMuster(at);
  const window = open ?? nextMuster(at);

  const base: MusterState = {
    open: open !== null,
    opensAt: window.opensAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
    now: at.toISOString(),
    claimed: null,
    vigil: null,
    best: null,
    nextGlory: null,
    crestAt: VIGIL_CREST_DAYS,
    crestHeld: null,
  };

  if (!profileId) return base;

  const row = await readVigil(db, profileId);
  const today = claimDay(at);
  const claimed = row.muster_day === today;
  const vigil = Math.max(0, row.muster_streak ?? 0);

  /* What the next claim would be worth. If today is already claimed the offer
     on show is tomorrow's, which continues the vigil; if it is not, it is
     today's, which continues it only if yesterday was kept. Either way the
     figure has to be what the member would actually be handed, because a
     number on a button that turns out to be wrong is worse than no number. */
  const yesterday = claimDay(new Date(at.getTime() - 86_400_000));
  const nextVigil = claimed
    ? vigil + 1
    : row.muster_day === yesterday
      ? vigil + 1
      : 1;

  const { data: crest } = await db
    .from("user_crests")
    .select("crest_slug")
    .eq("profile_id", profileId)
    .eq("crest_slug", "lord-of-light")
    .maybeSingle();

  return {
    ...base,
    claimed,
    vigil,
    best: Math.max(0, row.muster_best ?? 0),
    nextGlory: musterGlory(nextVigil),
    crestHeld: crest !== null,
  };
}

export interface MusterClaim {
  claimed: boolean;
  reason?: string;
  streak: number;
  best: number;
  /* What the vigil was worth, and what the day's allowance actually paid.
     Both, always: a surface that shows only the second cannot explain a zero,
     and a surface that shows only the first is lying about what happened. */
  offered: number;
  glory: number;
  capped: boolean;
}

/* Claim the day. The window check is the caller's job (the route answers 409
   with the window so the surface can say when to come back); this is the part
   that has to be indivisible, and it all happens inside public.claim_muster
   under a row lock. */
export async function claimMuster(
  db: SupabaseClient,
  profileId: string,
  at: Date = new Date()
): Promise<MusterClaim | null> {
  const { data, error } = await db.rpc("claim_muster", {
    p_profile_id: profileId,
    p_day: claimDay(at),
    p_base: MUSTER_BASE_GLORY,
    p_step: MUSTER_STREAK_GLORY,
    p_max: MUSTER_MAX_GLORY,
    p_daily_cap: DAILY_SOCIAL_RENOWN_CAP,
  });

  if (error) {
    console.error("[muster] claim failed", error.message);
    return null;
  }

  const result = (data ?? {}) as Partial<MusterClaim>;
  const claim: MusterClaim = {
    claimed: result.claimed === true,
    reason: result.reason,
    streak: result.streak ?? 0,
    best: result.best ?? 0,
    offered: result.offered ?? 0,
    glory: result.glory ?? 0,
    capped: result.capped === true,
  };

  /* The vigil crest is checked after the claim rather than inside it, and the
     split is deliberate. The claim is the part that must be atomic, because
     it moves a balance. Granting a crest is idempotent by its own unique key,
     so a crash before it happens costs nothing: the next claim grants it, and
     the member is not out a single point of Glory in the meantime. Putting it
     inside the transaction would have meant a failed notification insert
     rolling back a Muster that was correctly paid. */
  if (claim.claimed) await checkAndGrantCrests(db, profileId);

  return claim;
}
