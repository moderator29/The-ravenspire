import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { emit } from "@/lib/realm/events";
import { normalizeCall, CALL_TIMEFRAMES } from "@/lib/calls/types";
import { resolvePriceCall } from "@/lib/calls/resolvers/price";
import { resolveInternalCall } from "@/lib/calls/resolvers/internal";
import { applyCallScore, scoreResolvedCall } from "@/lib/calls/settle";
import { NO_STAKE, settleCallStake } from "@/lib/calls/escrow";
import { stakeBonus } from "@/lib/calls/stake";
import { difficultyWeight, HORIZON_DAYS } from "@/lib/calls/scoring";

const DAY_MS = 24 * 3600 * 1000;

/* How long each Call window runs before the verdict job may settle it. */
const WINDOW_MS: Record<string, number> = Object.fromEntries(
  CALL_TIMEFRAMES.map((tf) => [tf, HORIZON_DAYS[tf] * DAY_MS])
);

/* V2 finding P4. The old sweep took the oldest 100 open Calls of any timeframe,
   then skipped the ones that had not matured. A 30d Call is open and old for 29
   of its 30 days, so a backlog of long-window Calls could fill every slot in the
   batch and starve the 24h Calls that were actually ready. Each timeframe now
   gets its own query with its own maturity cutoff, so an immature Call is never
   fetched at all and cannot consume a slot. The ceiling is also raised: the
   settlement work is one price lookup per Call, and refusing to settle a Call
   that has matured is worse than the cost of settling it. */
const PER_TIMEFRAME_LIMIT = 250;

interface CallPost {
  id: string;
  author_id: string;
  house_slug: string | null;
  call: unknown;
  created_at: string;
}

/* Settles matured Calls against real data on a schedule. Guarded by the cron
   secret so no one can time their own settlement. Verdicts come from real
   prices and real realm rows only. */
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

  const now = Date.now();
  const due: CallPost[] = [];

  for (const timeframe of CALL_TIMEFRAMES) {
    const matured = new Date(now - WINDOW_MS[timeframe]).toISOString();
    const { data } = await db
      .from("posts")
      .select("id, author_id, house_slug, call, created_at")
      .eq("kind", "call")
      .eq("deleted", false)
      .filter("call->>verdict", "eq", "open")
      .filter("call->>timeframe", "eq", timeframe)
      .lt("created_at", matured)
      .order("created_at", { ascending: true })
      .limit(PER_TIMEFRAME_LIMIT);
    due.push(...((data ?? []) as CallPost[]));
  }

  /* Rows sealed before the timeframe was always written carry no timeframe at
     all and would never match any of the three queries above. They default to
     24h, which is what the old settlement path assumed. */
  const legacyCutoff = new Date(now - WINDOW_MS["24h"]).toISOString();
  const { data: untimed } = await db
    .from("posts")
    .select("id, author_id, house_slug, call, created_at")
    .eq("kind", "call")
    .eq("deleted", false)
    .filter("call->>verdict", "eq", "open")
    .is("call->>timeframe", null)
    .lt("created_at", legacyCutoff)
    .order("created_at", { ascending: true })
    .limit(PER_TIMEFRAME_LIMIT);
  due.push(...((untimed ?? []) as CallPost[]));

  let settled = 0;
  let scored = 0;

  for (const post of due) {
    const call = normalizeCall(post.call);
    if (!call || call.verdict !== "open") continue;

    const windowMs = WINDOW_MS[call.timeframe ?? "24h"] ?? WINDOW_MS["24h"];
    if (Date.parse(post.created_at) + windowMs > now) continue;

    /* No data, no verdict. The Call stays open and the next sweep tries again,
       which is strictly better than settling on a guess. */
    const resolution =
      call.resolver === "internal"
        ? await resolveInternalCall(db, call)
        : await resolvePriceCall(call);
    if (!resolution) continue;

    const hit = resolution.verdict === "hit";

    /* Difficulty-adjusted score, computed before the guarded update so the
       score can be written into the same row in the same statement. */
    const score = await scoreResolvedCall(db, {
      call,
      authorId: post.author_id,
      houseSlug: post.house_slug,
      createdAt: post.created_at,
      hit,
    });

    const settledPrice =
      "settledPrice" in resolution ? resolution.settledPrice : undefined;

    /* What the stake, if there is one, is about to do. Computed before the
       guarded update so the outcome can be written into the same row in the
       same statement, exactly as the score is, and so a reader of the Call
       never sees a settled verdict with an unresolved stake beside it.

       This is the deterministic part. The Warden's Pardon is not, because it
       depends on a House allowance that another settlement in the same sweep
       may have just drawn down, so it is written afterwards from what the
       settlement function actually paid. */
    const stake = typeof call.stake === "number" ? call.stake : 0;
    const stakeReturn = hit ? stake + stakeBonus(stake, score.score) : 0;

    /* The settled `call` jsonb, built once. The pardon may have to rewrite it a
       moment later with one more field, and two hand written copies of this
       object is how the two end up disagreeing about the verdict. */
    const settledCall = {
      ...call,
      verdict: resolution.verdict,
      ...(settledPrice !== undefined ? { settled_price: settledPrice } : {}),
      settled_at: new Date().toISOString(),
      score: score.score,
      score_basis: score.basis,
      ...(stake > 0
        ? {
            stake_result: hit ? ("returned" as const) : ("burned" as const),
            stake_return: stakeReturn,
          }
        : {}),
    };

    /* The guarded update is the whole race fix. Two overlapping cron runs, or a
       manual invocation racing the scheduled one, both used to read the same
       open Call and both used to award for it. Filtering on verdict = 'open'
       inside the UPDATE means exactly one of them flips the row, and only the
       one that flipped it goes on to pay anything out. */
    const { data: flipped } = await db
      .from("posts")
      .update({ call: settledCall })
      .eq("id", post.id)
      .filter("call->>verdict", "eq", "open")
      .select("id");
    if (!flipped || flipped.length === 0) continue;

    settled++;

    /* The stake, settled once and only by the runner that flipped the row.

       Two independent reasons this cannot pay twice: the guarded update above
       means only one process reaches this line for a given Call, and
       settle_call_stake locks the escrow row and refuses anything that is not
       still escrowed. The second is what protects against a replay from any
       future path, not only from a second cron run.

       Skipped entirely for an unstaked Call, which is nearly all of them. The
       jsonb copy and the escrow row are written by the same request from the
       same validated draft, and a failed escrow deletes the post before the
       sweep can ever see it, so "the jsonb says nothing was staked" and "there
       is no escrow row" cannot come apart. Asking anyway would be one round
       trip per Call across a sweep of up to 750. */
    const stakeSettled =
      stake > 0
        ? await settleCallStake(db, {
            postId: post.id,
            verdict: resolution.verdict === "hit" ? "hit" : "miss",
            score: score.score,
          })
        : NO_STAKE;

    /* The pardon, if the House had one burning. Written back to the Call only
       when it actually paid, so an unpardoned burn carries no field claiming
       otherwise. */
    if (stakeSettled.pardon > 0) {
      await db
        .from("posts")
        .update({
          call: { ...settledCall, stake_pardon: stakeSettled.pardon },
        })
        .eq("id", post.id);
    }

    const subject = call.token ? `$${call.token}` : "the realm";
    /* The stake is the part of a verdict a member feels, so it is named in the
       notification rather than left for them to find in the Vault. */
    const stakeLine =
      stakeSettled.returned > 0
        ? ` ${stakeSettled.returned.toLocaleString()} POINTS came back.`
        : stakeSettled.burned > 0
          ? stakeSettled.pardon > 0
            ? ` ${stakeSettled.burned.toLocaleString()} POINTS burned, and the House pardoned ${stakeSettled.pardon.toLocaleString()}.`
            : ` ${stakeSettled.burned.toLocaleString()} POINTS burned.`
          : "";
    await db.from("notifications").insert({
      profile_id: post.author_id,
      kind: "call_verdict",
      subject_id: post.id,
      body: hit
        ? `Your Call on ${subject} struck true.${stakeLine}`
        : `Your Call on ${subject} missed its mark.${stakeLine}`,
    });

    /* The two currencies (section 9.3). Renown takes max(0, S) and never falls;
       Season Rating takes S signed and can. A Call sealed before V2 froze a
       baseline scores nothing here, because inventing its difficulty after the
       fact would be scoring the member against a world they never saw. */
    if (score.basis !== "legacy" && score.score !== 0) {
      await applyCallScore(db, post.author_id, score.score);
      scored++;
    }

    if (hit) {
      /* The flat participation award, scaled by how hard the Call actually was.
         A coin-flip Call now pays almost nothing and a Call made against the
         odds pays what it always did, which nullifies low-information spam
         without having to detect intent (section 9.5). A legacy row has no
         difficulty on record, so it keeps the flat award it was sealed under. */
      const weight = score.basis === "legacy" ? 1 : difficultyWeight(score.score);
      const points = Math.round(40 * weight);
      const glory = Math.round(25 * weight);
      if (points > 0 || glory > 0) {
        await award(db, post.author_id, {
          points,
          glory,
          reason: "call_hit",
          ref: post.id,
          category: "call",
        });
      }
    }

    await emit(db, {
      kind: "call.resolved",
      actorId: post.author_id,
      subjectType: "post",
      subjectId: post.id,
      houseSlug: post.house_slug,
      payload: {
        v: 1,
        verdict: resolution.verdict,
        token: call.token ?? null,
        stance: call.stance ?? null,
        timeframe: call.timeframe ?? "24h",
        category: call.category ?? "markets",
        resolver: call.resolver ?? "price",
        confidence: call.confidence ?? null,
        threshold: call.threshold ?? 0,
        pi_0: call.pi_0 ?? null,
        entry_price: call.entry_price ?? null,
        settled_price: settledPrice ?? null,
        score: score.score,
        score_basis: score.basis,
        stake: stakeSettled.stake,
        stake_returned: stakeSettled.returned,
        stake_burned: stakeSettled.burned,
      },
    });
  }

  /* Duels past their hour are settled by whatever votes stand; unanswered
     challenges are closed with honor intact. */
  const { data: staleDuels } = await db
    .from("duels")
    .select("id, status, challenger_id, opponent_id")
    .in("status", ["open", "voting"])
    .lt("ends_at", new Date().toISOString())
    .limit(50);
  let duelsClosed = 0;
  for (const duel of staleDuels ?? []) {
    if (duel.status === "open" || !duel.opponent_id) {
      await db.from("duels").update({ status: "expired" }).eq("id", duel.id);
      duelsClosed++;
      continue;
    }
    const { data: votes } = await db
      .from("duel_votes")
      .select("choice")
      .eq("duel_id", duel.id);
    const c = votes?.filter((v) => v.choice === "challenger").length ?? 0;
    const o = votes?.filter((v) => v.choice === "opponent").length ?? 0;
    if (c === o) {
      await db.from("duels").update({ status: "draw" }).eq("id", duel.id);
    } else {
      const winner = c > o ? duel.challenger_id : duel.opponent_id;
      /* Guarded the same way a Call is: only the run that actually flips the
         row out of its open state pays the winner. */
      const { data: closed } = await db
        .from("duels")
        .update({ status: "settled", winner_id: winner })
        .eq("id", duel.id)
        .in("status", ["open", "voting"])
        .select("id");
      if (closed && closed.length === 1) {
        await award(db, winner, {
          glory: 60,
          points: 30,
          reason: "duel_won",
          ref: duel.id,
        });
        await db.from("notifications").insert({
          profile_id: winner,
          kind: "duel_won",
          subject_id: duel.id,
          body: "The hour struck and the realm had spoken. The duel is yours.",
        });
      }
    }
    duelsClosed++;
  }

  return json({ ok: true, settled, scored, duelsClosed });
}
