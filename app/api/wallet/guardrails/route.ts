import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import {
  attestedChainId,
  CEILING_RAISE_DELAY_HOURS,
  decideSponsorship,
  SPONSORED_ACTS_PER_MEMBER,
  SPONSORED_ACTS_PER_REALM,
  SPONSORSHIP_WINDOW_HOURS,
  unsponsoredSentence,
} from "@/lib/chain/sponsorship";
import { parseCeilingWei } from "@/lib/chain/signing-ceiling";
import { getFlag } from "@/lib/flags";

/* /api/wallet/guardrails: what the realm will cover, and what the member will
 * sign.
 *
 * GET returns three things a member is owed about their own wallet: whether the
 * realm is covering gas and, when it is not, exactly why in a sentence they can
 * act on; how much of the gas cover they and the realm have used this month; and
 * their own ceiling on what a Ravenspire surface may ask them to sign, including
 * any raise still waiting out its delay.
 *
 * POST takes one action, set_ceiling, and it is deliberately the only one. The
 * counters are not settable: they are counted from the sponsorship ledger, and a
 * route that could write them would be a route that could grant itself budget.
 *
 * WHAT THIS ROUTE CANNOT TELL YOU, and the surfaces have to compose it in.
 * The server decides whether sponsorship is PERMITTED. It cannot decide whether
 * it is POSSIBLE, because whether a member actually has a smart account depends
 * on configuration held in the Privy dashboard and delivered to the browser, and
 * no server-side check can see it. So `payer: "realm"` here means "the realm is
 * willing", never "the gas is definitely covered". components/wallet/use-sponsorship.ts
 * composes this with what the browser can see and only then says who pays. A
 * surface that rendered this answer alone would be promising free gas it cannot
 * deliver, which is the exact failure this whole mission is built to avoid.
 */

/* Flag-dependent and per-caller: never baked at build time. */
export const dynamic = "force-dynamic";

const UNDEFINED_FUNCTION = "42883";
const UNDEFINED_TABLE = "42P01";

/* The thresholds, echoed to the surface so it renders the numbers the server
   enforces rather than a second copy that drifts. */
const POLICY = {
  windowHours: SPONSORSHIP_WINDOW_HOURS,
  memberAllowance: SPONSORED_ACTS_PER_MEMBER,
  realmAllowance: SPONSORED_ACTS_PER_REALM,
  ceilingRaiseDelayHours: CEILING_RAISE_DELAY_HOURS,
} as const;

type GuardrailsState = {
  tx_ceiling_wei: string | null;
  pending_tx_ceiling_wei: string | null;
  pending_tx_ceiling_at: string | null;
  member_used: number;
  member_allowance: number;
  realm_used: number;
  realm_allowance: number;
};

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db.rpc("wallet_guardrails_state", {
    p_profile_id: profile.id,
    p_window_hours: SPONSORSHIP_WINDOW_HOURS,
    p_member_allowance: SPONSORED_ACTS_PER_MEMBER,
    p_realm_allowance: SPONSORED_ACTS_PER_REALM,
  });

  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      return json({ error: "not migrated" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const state = (data ?? null) as GuardrailsState | null;
  if (!state) return json({ error: "unavailable" }, 503);

  const attested = attestedChainId();
  const verdict = decideSponsorship({
    flagLive: await getFlag("gasless_live"),
    /* Reported for the chain a paymaster was attested for. The per-act call
       site names its own chain and can therefore genuinely differ from this
       one; here there is nothing else it could sensibly mean, and when nothing
       is attested the `unconfigured` check fires before the chain is compared. */
    chainId: attested ?? 0,
    attestedChainId: attested,
    memberUsed: state.member_used,
    memberAllowance: state.member_allowance,
    realmUsed: state.realm_used,
    realmAllowance: state.realm_allowance,
  });

  return json({
    policy: POLICY,
    state,
    sponsorship:
      verdict.payer === "realm"
        ? { permitted: true, chainId: attested }
        : {
            permitted: false,
            reason: verdict.reason,
            sentence: unsponsoredSentence(verdict.reason),
          },
  });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  /* Generous, because setting a ceiling moves no money and a member adjusting
     their own guardrail should not be told to come back later. Tight enough
     that it is not a write loop. Matches the compliance route's shape. */
  const rl = await rateLimit(profileKey("wallet-guardrails", profile.id), 30, 3600);
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    ceilingWei?: unknown;
  } | null;

  if (body?.action !== "set_ceiling") {
    return json({ error: "unknown action" }, 400);
  }

  /* Null clears the ceiling, which is a raise to no ceiling at all and waits
     out the delay like any other raise. Anything else must be a decimal STRING
     of wei: a JSON number would be rounded by the parser somewhere above 2^53,
     which for wei is under a hundredth of an ETH, so a member setting 0.5 could
     land on something that is not 0.5. The same reason the claim voucher
     carries its uint256 fields as strings. */
  const raw = body?.ceilingWei;
  let ceilingWei: string | null;
  if (raw === null || raw === undefined) {
    ceilingWei = null;
  } else if (typeof raw === "string") {
    const parsed = parseCeilingWei(raw);
    if (parsed === null) {
      return json({ error: "That is not an amount the realm can hold" }, 400);
    }
    /* Re-serialised from the bigint rather than passed through, so what reaches
       the database is exactly what was validated and never the caller's own
       spelling of it. */
    ceilingWei = parsed.toString();
  } else {
    return json(
      { error: "A ceiling must be a decimal string of wei, or null" },
      400
    );
  }

  const { data, error } = await db.rpc("wallet_set_tx_ceiling", {
    p_profile_id: profile.id,
    p_ceiling_wei: ceilingWei,
    p_delay_hours: CEILING_RAISE_DELAY_HOURS,
  });

  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      return json({ error: "not migrated" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  return json({ ok: true, result: data ?? null });
}
