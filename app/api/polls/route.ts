import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    post_id?: string;
    option?: number;
  } | null;
  if (!body?.post_id || typeof body.option !== "number")
    return json({ error: "bad request" }, 400);

  const { data: post } = await db
    .from("posts")
    .select("id, poll")
    .eq("id", body.post_id)
    .single();
  const poll = post?.poll as { options: { text: string; votes: number }[] } | null;
  if (!poll) return json({ error: "No poll on that raven" }, 400);
  if (body.option < 0 || body.option >= poll.options.length)
    return json({ error: "No such choice" }, 400);

  const { error } = await db.from("poll_votes").insert({
    post_id: body.post_id,
    voter_id: profile.id,
    option_index: body.option,
  });
  if (error) return json({ error: "You have already spoken" }, 409);

  /* Recount from the truth table, never trust the cached numbers. */
  const { data: votes } = await db
    .from("poll_votes")
    .select("option_index")
    .eq("post_id", body.post_id);
  const options = poll.options.map((o, i) => ({
    ...o,
    votes: (votes ?? []).filter((v) => v.option_index === i).length,
  }));
  await db
    .from("posts")
    .update({ poll: { options } })
    .eq("id", body.post_id);

  return json({ ok: true, options });
}
