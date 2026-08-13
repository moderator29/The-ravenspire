import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LONG_WATCH_EXTRA_SLOTS,
  activePerks,
  hasActivePerk,
  perkMeta,
  perkPrice,
  type HousePerkSlug,
  type HousePerkView,
} from "@/lib/houses/perks";
import {
  DAILY_ENDOWMENT_CAP,
  ENDOWMENT_TREASURY_BPS,
  MIN_ENDOWMENT,
} from "@/lib/houses/endowment";

/* Reading and spending a House treasury.

   The rules and the prices are in lib/houses/perks.ts, which is client safe so
   the hall can render the catalogue a member is about to buy from. This module
   is the server half: the reads, and the one call that actually moves points.

   Nothing here decides anything on its own. Every guard that matters (who may
   spend, whether the House can afford it, whether the perk is already burning)
   is enforced inside spend_house_treasury under the House row lock, because a
   check in TypeScript and a write in Postgres are two moments and a treasury
   can be spent twice in between them. What this module adds is the price, read
   from the catalogue against the House's real sworn count, and the plumbing. */

/* ------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------ */

/* Every perk this House has ever bought, newest first. The hall renders this
   as the purchase history, which is half the audit trail. */
export async function loadHousePerks(
  db: SupabaseClient,
  houseSlug: string,
  limit = 20
): Promise<HousePerkView[]> {
  const { data } = await db
    .from("house_perks")
    .select("perk, cost, starts_at, expires_at, allowance_remaining, actor_id")
    .eq("house_slug", houseSlug)
    .order("starts_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as {
    perk: string;
    cost: number;
    starts_at: string;
    expires_at: string;
    allowance_remaining: number | null;
    actor_id: string | null;
  }[]).map((row) => ({
    slug: row.perk,
    cost: Number(row.cost) || 0,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    allowance_remaining:
      row.allowance_remaining === null ? null : Number(row.allowance_remaining),
    actor_id: row.actor_id,
  }));
}

/* Only what is burning right now. Kept as its own query with its own window
   filter so the hot path (every Call creation checks the open-Call ceiling)
   does not read a House's whole purchase history to answer one boolean. */
export async function loadActivePerks(
  db: SupabaseClient,
  houseSlug: string | null
): Promise<HousePerkView[]> {
  if (!houseSlug) return [];
  const now = new Date().toISOString();
  const { data } = await db
    .from("house_perks")
    .select("perk, cost, starts_at, expires_at, allowance_remaining, actor_id")
    .eq("house_slug", houseSlug)
    .lte("starts_at", now)
    .gt("expires_at", now)
    .limit(20);

  const rows = ((data ?? []) as {
    perk: string;
    cost: number;
    starts_at: string;
    expires_at: string;
    allowance_remaining: number | null;
    actor_id: string | null;
  }[]).map((row) => ({
    slug: row.perk,
    cost: Number(row.cost) || 0,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    allowance_remaining:
      row.allowance_remaining === null ? null : Number(row.allowance_remaining),
    actor_id: row.actor_id,
  }));
  /* The window filter is the database's; the allowance test is the
     catalogue's, because only the catalogue knows which perks have one. */
  return activePerks(rows);
}

/* The extra open-Call slots this member's House has bought them, or zero.

   Zero is the answer for a member with no House, for a House that has bought
   nothing, and for any failure to read: a perk that cannot be confirmed is a
   perk that is not burning, which is the safe direction. */
export async function extraOpenCallSlots(
  db: SupabaseClient,
  houseSlug: string | null
): Promise<number> {
  if (!houseSlug) return 0;
  const perks = await loadActivePerks(db, houseSlug);
  return hasActivePerk(perks, "long-watch") ? LONG_WATCH_EXTRA_SLOTS : 0;
}

/* Whether the cached balance on `houses` still agrees with the ledger that is
   supposed to explain it.

   Both ledgers in this product keep a cached total beside their rows, which is
   the right shape and also the shape that drifts in silence. The sum is done in
   the database by public.reconcile_house_treasury, never by reading the rows
   into Node and adding them up: a partial read would report a drift that is
   only its own truncation, and "this House's treasury does not add up" is far
   too serious a claim to make from an incomplete count.

   A failure to read is reported as unknown rather than as agreement. A tick
   nobody checked is worse than no tick. */
export interface TreasuryReconciliation {
  cached: number;
  ledger: number;
  drift: number;
  entries: number;
  reconciled: boolean;
  known: boolean;
}

export async function reconcileTreasury(
  db: SupabaseClient,
  houseSlug: string
): Promise<TreasuryReconciliation> {
  const { data, error } = await db.rpc("reconcile_house_treasury", {
    p_house_slug: houseSlug,
  });
  const row = (data ?? null) as {
    cached?: number;
    ledger?: number;
    entries?: number;
  } | null;
  if (error || !row) {
    return { cached: 0, ledger: 0, drift: 0, entries: 0, reconciled: false, known: false };
  }
  const cached = Number(row.cached) || 0;
  const ledger = Number(row.ledger) || 0;
  return {
    cached,
    ledger,
    drift: cached - ledger,
    entries: Number(row.entries) || 0,
    reconciled: cached === ledger,
    known: true,
  };
}

export interface TreasuryEntry {
  delta: number;
  reason: string;
  ref: string | null;
  actor_id: string | null;
  created_at: string;
}

/* The audit trail, newest first. Every inflow names the Call whose stake
   burned; every outflow names the member who spent it. */
export async function loadTreasuryLedger(
  db: SupabaseClient,
  houseSlug: string,
  limit = 30
): Promise<TreasuryEntry[]> {
  const { data } = await db
    .from("house_treasury_ledger")
    .select("delta, reason, ref, actor_id, created_at")
    .eq("house_slug", houseSlug)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as TreasuryEntry[]).map((row) => ({
    ...row,
    delta: Number(row.delta) || 0,
  }));
}

/* How many members are sworn to this House right now, from the oath ledger.
   This is what prices a perk, so it comes from house_members and not from the
   houses.member_count counter, which is maintained by hand at onboarding and
   drifts (the same reason lib/houses/scoring.ts refuses it). */
export async function swornCount(
  db: SupabaseClient,
  houseSlug: string
): Promise<number> {
  const { count } = await db
    .from("house_members")
    .select("id", { count: "exact", head: true })
    .eq("house_slug", houseSlug)
    .is("left_at", null);
  return count ?? 0;
}

/* ------------------------------------------------------------------
   The spend
   ------------------------------------------------------------------ */

export type SpendResult =
  | { ok: true; perkId: string; cost: number; treasury: number }
  | { ok: false; error: string; status: number };

/* Every refusal spend_house_treasury can return, in the member's language.
   Written out rather than passed through, because a reason code is a debugging
   aid and a member reading a hall needs a sentence. */
const REFUSALS: Record<string, { error: string; status: number }> = {
  no_house: { error: "No House by that name holds a banner.", status: 404 },
  not_sworn: {
    error: "Only a member sworn to this House may spend its treasury.",
    status: 403,
  },
  not_titled: {
    error:
      "Only the Lord and the Hand of the House may spend the treasury. Both titles are earned by contribution and turn over each season.",
    status: 403,
  },
  already_burning: {
    error: "That perk is already burning over the House.",
    status: 409,
  },
  insufficient: {
    error: "The treasury does not hold enough for that yet.",
    status: 409,
  },
  bad_cost: { error: "That perk has no price.", status: 400 },
  bad_duration: { error: "That perk has no window.", status: 400 },
};

/* Buy one perk for one House.

   The price is computed here from the live sworn count so that a member cannot
   send one, and so the figure charged is the figure the hall showed. Every
   other guard belongs to the RPC and is deliberately not repeated: repeating a
   check in TypeScript would only move the race, not close it. */
export async function buyHousePerk(
  db: SupabaseClient,
  opts: { houseSlug: string; actorId: string; perk: HousePerkSlug }
): Promise<SpendResult> {
  const meta = perkMeta(opts.perk);
  if (!meta)
    return { ok: false, error: "No such perk.", status: 404 };

  const members = await swornCount(db, opts.houseSlug);
  const cost = perkPrice(meta, members);

  const { data, error } = await db.rpc("spend_house_treasury", {
    p_house_slug: opts.houseSlug,
    p_actor_id: opts.actorId,
    p_perk: meta.slug,
    p_cost: cost,
    p_duration_days: meta.durationDays,
    p_allowance: meta.allowance,
  });

  if (error) {
    console.error("[treasury] spend failed", meta.slug, error.message);
    return {
      ok: false,
      error: "The treasury could not be opened. Try again.",
      status: 503,
    };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    perk_id?: string;
    cost?: number;
    treasury?: number;
  };

  if (!result.ok) {
    const refusal = REFUSALS[result.reason ?? ""] ?? {
      error: "The treasury refused that.",
      status: 400,
    };
    return { ok: false, ...refusal };
  }

  return {
    ok: true,
    perkId: result.perk_id ?? "",
    cost: Number(result.cost) || cost,
    treasury: Number(result.treasury) || 0,
  };
}

/* ------------------------------------------------------------------
   The endowment
   ------------------------------------------------------------------ */

/* Everything this member has committed to any House today, on the server's
   clock.

   Across every House, not per House: a member has one daily allowance, not one
   per banner they have ever sworn to. Used only to render an honest control and
   to refuse before a member commits. The ceiling that actually binds is
   re-derived inside endow_house_treasury under the member's profile row lock,
   because a cap checked here and enforced there is a cap two concurrent
   requests both pass. */
export async function endowedToday(
  db: SupabaseClient,
  profileId: string
): Promise<number> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await db
    .from("house_endowments")
    .select("committed")
    .eq("profile_id", profileId)
    .gte("created_at", since.toISOString())
    .limit(200);
  let total = 0;
  for (const row of (data ?? []) as { committed: number }[]) {
    total += Number(row.committed) || 0;
  }
  return total;
}

export type EndowResult =
  | {
      ok: true;
      /* Zero when this was a replay of a gift that already landed. */
      committed: number;
      toTreasury: number;
      destroyed: number;
      balance: number;
      treasury: number;
      replayed: boolean;
    }
  | { ok: false; error: string; status: number };

/* Every refusal endow_house_treasury can return, in the member's language.
   Written out rather than passed through, for the same reason the perk
   refusals are: a reason code is a debugging aid and a member handing over
   their balance is owed a sentence. */
const ENDOW_REFUSALS: Record<string, { error: string; status: number }> = {
  not_positive: { error: "An endowment has to be more than nothing.", status: 400 },
  bad_terms: { error: "The realm could not price that endowment.", status: 400 },
  below_minimum: {
    error: `The smallest endowment the realm takes is ${MIN_ENDOWMENT} POINTS.`,
    status: 400,
  },
  over_daily_cap: {
    error: `A member may commit ${DAILY_ENDOWMENT_CAP} POINTS to their House in a day, and you have reached it.`,
    status: 409,
  },
  insufficient: { error: "You do not hold that many POINTS.", status: 409 },
  not_sworn: {
    error: "Only a member sworn to this House may fill its treasury.",
    status: 403,
  },
  no_member: { error: "No such member.", status: 404 },
};

/* Commit POINTS from one member's balance to one House treasury.
 *
 * The terms travel with the call rather than being duplicated in PL/pgSQL, the
 * same way a perk's price does: the catalogue and the reasoning live in
 * TypeScript where they can be explained, and the database bounds them so a
 * caller cannot send terms that would let a treasury gain more than the burn
 * destroys. Every guard that decides the outcome (the oath, the balance, the
 * day's running total) is inside the function under the profile row lock, and
 * is deliberately not repeated here: repeating a check in TypeScript moves the
 * race, it does not close it. */
export async function endowHouseTreasury(
  db: SupabaseClient,
  opts: {
    requestId: string;
    houseSlug: string;
    profileId: string;
    amount: number;
  }
): Promise<EndowResult> {
  const { data, error } = await db.rpc("endow_house_treasury", {
    p_request_id: opts.requestId,
    p_house_slug: opts.houseSlug,
    p_profile_id: opts.profileId,
    p_amount: opts.amount,
    p_min: MIN_ENDOWMENT,
    p_daily_cap: DAILY_ENDOWMENT_CAP,
    p_treasury_bps: ENDOWMENT_TREASURY_BPS,
  });

  if (error) {
    console.error("[treasury] endowment failed", error.message);
    return {
      ok: false,
      error: "The treasury could not be opened. Try again.",
      status: 503,
    };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    committed?: number;
    to_treasury?: number;
    destroyed?: number;
    balance?: number;
    treasury?: number;
  };

  if (!result.ok) {
    const refusal = ENDOW_REFUSALS[result.reason ?? ""] ?? {
      error: "The treasury refused that.",
      status: 400,
    };
    return { ok: false, ...refusal };
  }

  return {
    ok: true,
    committed: Number(result.committed) || 0,
    toTreasury: Number(result.to_treasury) || 0,
    destroyed: Number(result.destroyed) || 0,
    balance: Number(result.balance) || 0,
    treasury: Number(result.treasury) || 0,
    /* A retry of a gift that already landed. Reported so the surface can say
       "already given" rather than showing a second gift that did not happen. */
    replayed: result.reason === "already",
  };
}
