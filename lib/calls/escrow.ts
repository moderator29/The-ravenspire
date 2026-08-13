import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Holding and releasing a Call's stake.

   Two thin wrappers over the two Postgres functions that do the real work. All
   of the safety lives in the SQL, deliberately: escrow_call_stake takes the
   member's profile row lock before it reads the balance, and settle_call_stake
   takes the escrow row's lock and refuses anything that is not still escrowed.
   Neither guarantee can be expressed from here, which is why neither is
   attempted from here. See
   supabase/migrations/20260813104201_call_stakes_and_house_treasury.sql. */

export interface EscrowResult {
  ok: boolean;
  escrowed: number;
  reason: string;
}

/* Take the stake out of the member's balance and record the escrow.

   The post has to exist first, because the post id IS the idempotency key, so
   this necessarily runs after the insert. The caller is responsible for
   undoing the post when this refuses; see the comment at its call site in
   app/api/posts/route.ts for why an orphaned escrow would be worse than an
   orphaned post.

   An RPC error is a refusal, never a silent pass. Failing open here would seal
   a staked Call with nothing actually held, so the member would risk nothing
   and could still be paid a bonus at settlement. */
export async function escrowCallStake(
  db: SupabaseClient,
  opts: {
    postId: string;
    profileId: string;
    stake: number;
    houseSlug: string | null;
  }
): Promise<EscrowResult> {
  if (!opts.stake || opts.stake <= 0)
    return { ok: true, escrowed: 0, reason: "none" };

  const { data, error } = await db.rpc("escrow_call_stake", {
    p_post_id: opts.postId,
    p_profile_id: opts.profileId,
    p_stake: opts.stake,
    p_house_slug: opts.houseSlug,
  });

  if (error) {
    console.error("[calls] escrow failed", opts.postId, error.message);
    return { ok: false, escrowed: 0, reason: "error" };
  }

  const result = (data ?? {}) as Partial<EscrowResult>;
  return {
    ok: result.ok === true,
    escrowed: result.escrowed ?? 0,
    reason: result.reason ?? "unknown",
  };
}

export interface StakeSettlement {
  settled: boolean;
  stake: number;
  bonus: number;
  returned: number;
  burned: number;
  tithe: number;
  pardon: number;
}

/* The settlement of a Call that never carried a stake. Exported so a caller
   can skip the round trip for the overwhelming majority of Calls without
   having to invent this shape at every call site. */
export const NO_STAKE: StakeSettlement = {
  settled: false,
  stake: 0,
  bonus: 0,
  returned: 0,
  burned: 0,
  tithe: 0,
  pardon: 0,
};

/* Settle one Call's stake, once.

   Safe to call for every settled Call, staked or not: a Call with no escrow
   row returns settled:false and touches nothing. Safe to call twice: the
   second call finds a row that is no longer escrowed and returns
   settled:false. That second property is the whole reason this is one RPC and
   not a read followed by a write. */
export async function settleCallStake(
  db: SupabaseClient,
  opts: { postId: string; verdict: "hit" | "miss" | "void"; score: number }
): Promise<StakeSettlement> {
  const { data, error } = await db.rpc("settle_call_stake", {
    p_post_id: opts.postId,
    p_verdict: opts.verdict,
    p_score: Math.round(opts.score),
  });

  if (error) {
    console.error("[calls] stake settlement failed", opts.postId, error.message);
    return NO_STAKE;
  }

  const result = (data ?? {}) as Partial<StakeSettlement>;
  return {
    settled: result.settled === true,
    stake: result.stake ?? 0,
    bonus: result.bonus ?? 0,
    returned: result.returned ?? 0,
    burned: result.burned ?? 0,
    tithe: result.tithe ?? 0,
    pardon: result.pardon ?? 0,
  };
}
