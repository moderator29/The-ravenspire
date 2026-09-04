import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getRoundState,
  seasonZeroChains,
  weiFromNumeric,
} from "@/lib/season-zero/server";
import { SEASON_ZERO, rspForWei } from "@/lib/season-zero";

/* GET /api/season-zero: the state of the founding round.
 *
 * Public, deliberately: the raise bar renders for every member and the
 * numbers on it are the same for everyone, because they are the chain's
 * numbers. A caller who presents a valid token additionally gets their own
 * verified contributions and their exact $RSP allocation.
 *
 * Every wei figure crosses the wire as a string. JSON numbers are IEEE
 * doubles and 15 ETH of wei does not fit in one. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const state = await getRoundState();

  const base = {
    phase: state.phase,
    raisedWei: state.raisedWei.toString(),
    backerCount: state.backerCount,
    startsAt: SEASON_ZERO.startsAt,
    endsAt: SEASON_ZERO.endsAt,
    softcapEth: SEASON_ZERO.softcapEth,
    hardcapEth: SEASON_ZERO.hardcapEth,
    rspPerEth: SEASON_ZERO.rspPerEth,
    rspAllocation: SEASON_ZERO.rspAllocation,
    supplyPct: SEASON_ZERO.supplyPct,
    minContributionEth: SEASON_ZERO.minContributionEth,
    treasury: SEASON_ZERO.treasury,
    /* Each chain carries whether the realm can verify a transfer on it right
       now. The page offers only the chains that answer true: a round that
       cannot check a receipt must not ask anyone to send. */
    chains: seasonZeroChains(),
  };

  /* Read-only auth: a bad or absent token simply means no personal section.
     getProfile never mints a profile row, so this public route cannot be used
     to probe one into existence. */
  const profile = await getProfile(req);
  if (!profile) return json(base);

  const db = adminClient();
  if (!db) return json(base);

  try {
    const { data, error } = await db
      .from("season_zero_contributions")
      .select("id, chain_id, tx_hash, wallet_address, amount_wei, status, created_at")
      .eq("user_id", profile.id)
      .eq("status", "verified")
      .order("created_at", { ascending: true });
    if (error || !data) return json(base);

    let totalWei = 0n;
    const contributions = data.map((row) => {
      const wei = weiFromNumeric(row.amount_wei);
      totalWei += wei;
      return {
        id: row.id as string,
        chainId: row.chain_id as number,
        txHash: row.tx_hash as string,
        walletAddress: row.wallet_address as string,
        amountWei: wei.toString(),
        rsp: rspForWei(wei).toString(),
        createdAt: row.created_at as string,
      };
    });

    return json({
      ...base,
      yours: {
        contributions,
        totalWei: totalWei.toString(),
        totalRsp: rspForWei(totalWei).toString(),
      },
    });
  } catch {
    /* The personal section failing soft must not take the public state down;
       the same posture as getRoundState itself. */
    return json(base);
  }
}
