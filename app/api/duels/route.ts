import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { duelPrompts } from "@/lib/game/quests";

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: "create" | "enter" | "vote";
    duel_id?: string;
    prompt?: string;
    entry?: string;
    choice?: "challenger" | "opponent";
  } | null;
  if (!body?.action) return json({ error: "bad request" }, 400);

  if (body.action === "create") {
    const prompt =
      duelPrompts.find((p) => p.slug === body.prompt)?.prompt ??
      body.prompt?.slice(0, 200);
    if (!prompt) return json({ error: "A duel needs a prompt" }, 400);
    const entry = body.entry?.trim().slice(0, 400);
    if (!entry) return json({ error: "A duel needs your opening blow" }, 400);
    const { data, error } = await db
      .from("duels")
      .insert({
        challenger_id: profile.id,
        prompt,
        challenger_entry: entry,
        status: "open",
        ends_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) return json({ error: "Could not open the duel" }, 500);
    return json({ ok: true, id: data.id });
  }

  if (body.action === "enter") {
    if (!body.duel_id) return json({ error: "bad request" }, 400);
    const entry = body.entry?.trim().slice(0, 400);
    if (!entry) return json({ error: "An empty riposte wins nothing" }, 400);
    const { data: duel } = await db
      .from("duels")
      .select("id, challenger_id, status, ends_at")
      .eq("id", body.duel_id)
      .single();
    if (!duel || duel.status !== "open")
      return json({ error: "That duel is not open" }, 400);
    if (duel.ends_at && new Date(duel.ends_at).getTime() < Date.now())
      return json({ error: "That duel has closed. The moment has passed." }, 400);
    if (duel.challenger_id === profile.id)
      return json({ error: "You cannot duel yourself, however tempting" }, 400);

    /* Guarded update: only the entrant who flips the still open, still
       unanswered row wins the race. A second entrant sees zero rows changed
       and is told the duel is already answered, instead of silently
       overwriting the first riposte. */
    const { data: entered } = await db
      .from("duels")
      .update({
        opponent_id: profile.id,
        opponent_entry: entry,
        status: "voting",
      })
      .eq("id", duel.id)
      .eq("status", "open")
      .is("opponent_id", null)
      .select("id");
    if (!entered || entered.length === 0)
      return json({ error: "That duel has already been answered" }, 409);

    await db.from("notifications").insert({
      profile_id: duel.challenger_id,
      kind: "duel_answered",
      actor_id: profile.id,
      subject_id: duel.id,
      body: "Your duel has been answered. The realm votes.",
    });
    return json({ ok: true });
  }

  if (body.action === "vote") {
    if (!body.duel_id || !body.choice) return json({ error: "bad request" }, 400);
    if (body.choice !== "challenger" && body.choice !== "opponent")
      return json({ error: "Vote for one of the two duelists" }, 400);
    const { data: duel } = await db
      .from("duels")
      .select("id, status, challenger_id, opponent_id, ends_at")
      .eq("id", body.duel_id)
      .single();
    if (!duel || duel.status !== "voting")
      return json({ error: "This duel is not taking votes" }, 400);
    if (duel.ends_at && new Date(duel.ends_at).getTime() < Date.now())
      return json({ error: "Voting on this duel has closed" }, 400);
    if (profile.id === duel.challenger_id || profile.id === duel.opponent_id)
      return json({ error: "Duelists cannot vote for themselves" }, 400);
    const { error } = await db.from("duel_votes").insert({
      duel_id: duel.id,
      voter_id: profile.id,
      choice: body.choice,
    });
    if (error) return json({ error: "You have already voted" }, 409);
    await award(db, profile.id, { points: 2, reason: "duel_vote", ref: duel.id });

    /* Settle when a side reaches 5 votes with a lead of 2. */
    const { data: votes } = await db
      .from("duel_votes")
      .select("choice")
      .eq("duel_id", duel.id);
    const c = votes?.filter((v) => v.choice === "challenger").length ?? 0;
    const o = votes?.filter((v) => v.choice === "opponent").length ?? 0;
    if ((c >= 5 || o >= 5) && Math.abs(c - o) >= 2 && duel.opponent_id) {
      const winner = c > o ? duel.challenger_id : duel.opponent_id;
      /* Atomic, idempotent settle: only the voter whose conditional update
         actually flips status from voting to settled awards the winner. Two
         concurrent voters that both cross the threshold now settle exactly
         once, so the winner is never double awarded. */
      const { data: settled } = await db
        .from("duels")
        .update({ status: "settled", winner_id: winner })
        .eq("id", duel.id)
        .eq("status", "voting")
        .select("id");
      if (settled && settled.length === 1) {
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
          body: "The realm has spoken. The duel is yours.",
        });
      }
    }
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
