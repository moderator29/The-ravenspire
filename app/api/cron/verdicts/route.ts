import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { lookupToken } from "@/lib/data/tokens";

const WINDOW_MS: Record<string, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

/* Settles matured Calls against the live market on a schedule. Guarded by
   the cron secret so no one can time their own settlement. Verdicts come
   from real prices only. */
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

  /* Only OPEN calls old enough to possibly be matured enter the window. */
  const oldestMaturity = new Date(Date.now() - WINDOW_MS["24h"]).toISOString();
  const { data: posts } = await db
    .from("posts")
    .select("id, author_id, call, created_at")
    .eq("kind", "call")
    .eq("deleted", false)
    .filter("call->>verdict", "eq", "open")
    .lt("created_at", oldestMaturity)
    .order("created_at", { ascending: true })
    .limit(100);

  let settled = 0;
  for (const post of posts ?? []) {
    const call = post.call as {
      token: string;
      stance: "up" | "down";
      timeframe: string;
      entry_price: number;
      verdict: string;
    } | null;
    if (!call || call.verdict !== "open") continue;
    const windowMs = WINDOW_MS[call.timeframe] ?? WINDOW_MS["24h"];
    if (Date.parse(post.created_at) + windowMs > Date.now()) continue;

    const card = await lookupToken(call.token);
    if (!card || card.priceUsd === null) continue; /* no data, no verdict */

    const rose = card.priceUsd > call.entry_price;
    const hit = call.stance === "up" ? rose : !rose;
    await db
      .from("posts")
      .update({
        call: {
          ...call,
          verdict: hit ? "hit" : "miss",
          settled_price: card.priceUsd,
          settled_at: new Date().toISOString(),
        },
      })
      .eq("id", post.id);
    settled++;

    await db.from("notifications").insert({
      profile_id: post.author_id,
      kind: "call_verdict",
      subject_id: post.id,
      body: hit
        ? `Your Call on $${call.token} struck true.`
        : `Your Call on $${call.token} missed its mark.`,
    });
    if (hit) {
      await award(db, post.author_id, {
        points: 40,
        glory: 25,
        reason: "call_hit",
        ref: post.id,
      });
    }
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
      await db
        .from("duels")
        .update({ status: "settled", winner_id: winner })
        .eq("id", duel.id);
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
    duelsClosed++;
  }

  return json({ ok: true, settled, duelsClosed });
}
