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
