import { after } from "next/server";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { maybeRavenReplyToPost } from "@/lib/ai/mention";
import { notifyMentions } from "@/lib/notifications";
import { lookupToken } from "@/lib/data/tokens";

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    body?: string;
    kind?: string;
    media?: { url: string; type: string }[];
    poll?: { options: string[] };
    call?: { token: string; stance: "up" | "down"; timeframe: string };
    visibility?: string;
  } | null;
  if (!body) return json({ error: "bad request" }, 400);

  const text = (body.body ?? "").trim();
  if (!text && !body.media?.length)
    return json({ error: "An empty raven carries no word" }, 400);
  if (text.length > 1000) return json({ error: "Too long" }, 400);

  /* Who may see this raven. Unknown values fall back to public so an older
     client that omits the field keeps its existing all-realm reach. */
  const VISIBILITIES = ["public", "followers", "house", "mentions"] as const;
  const visibility = (VISIBILITIES as readonly string[]).includes(
    body.visibility ?? ""
  )
    ? (body.visibility as string)
    : "public";

  /* Handles named in the raven, lowercased and de-duped. Stored so a
     mentions-only raven can be shown to exactly the members it names. */
  const mentions = [
    ...new Set(
      [...text.matchAll(/@([a-z0-9_]{2,20})\b/gi)].map((m) =>
        m[1].toLowerCase()
      )
    ),
  ];

  /* Media must live in our own public media shelf; no hotlinked strangers.
     We match on the storage path segment rather than the full origin so a
     trailing slash, a custom storage domain, or any drift between the upload
     host and NEXT_PUBLIC_SUPABASE_URL cannot silently strip every image (the
     bug that left every post with media = []). The url must still be an
     absolute https URL that resolves to /storage/v1/object/public/media/. */
  const MEDIA_PATH = "/storage/v1/object/public/media/";
  const isOwnMedia = (url: unknown): url is string => {
    if (typeof url !== "string") return false;
    try {
      const u = new URL(url);
      return u.protocol === "https:" && u.pathname.startsWith(MEDIA_PATH);
    } catch {
      return false;
    }
  };
  const media = (body.media ?? [])
    .slice(0, 4)
    .filter(
      (m) =>
        isOwnMedia(m?.url) && (m.type === "image" || m.type === "video")
    );

  const cashtags = [...text.matchAll(/\$([a-zA-Z]{2,12})\b/g)].map((m) =>
    m[1].toUpperCase()
  );

  let kind = body.kind === "poll" ? "poll" : "raven";
  let call: Record<string, unknown> | null = null;
  if (body.call?.token && body.call.stance) {
    kind = "call";
    /* A Call locks the REAL entry price at creation; the verdict is
       settled later against real data. No price, no Call. */
    const card = await lookupToken(body.call.token);
    if (!card || card.priceUsd === null)
      return json(
        { error: "No live price found for that token, the Call cannot be sealed" },
        400
      );
    call = {
      token: card.symbol,
      address: card.address,
      chain: card.chain,
      stance: body.call.stance,
      timeframe: ["24h", "7d", "30d"].includes(body.call.timeframe)
        ? body.call.timeframe
        : "24h",
      entry_price: card.priceUsd,
      verdict: "open",
    };
  }

  const poll =
    kind === "poll" && body.poll?.options?.length
      ? {
          options: body.poll.options
            .slice(0, 4)
            .map((o) => ({ text: String(o).slice(0, 60), votes: 0 })),
        }
      : null;

  const { data: post, error } = await db
    .from("posts")
    .insert({
      author_id: profile.id,
      kind,
      body: text,
      media,
      cashtags,
      call,
      poll,
      visibility,
      mentions,
      house_slug: profile.house_slug,
    })
    .select(
      "id, author_id, kind, body, media, cashtags, call, poll, house_slug, visibility, mentions, like_count, reply_count, repost_count, view_count, created_at, author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)"
    )
    .single();
  if (error || !post) return json({ error: "Could not send the raven" }, 500);

  await award(db, profile.id, {
    points: kind === "call" ? 8 : 5,
    glory: 2,
    reason: kind === "call" ? "sealed_a_call" : "sent_a_raven",
    ref: post.id,
  });

  /* Raise Your Banners: a referral activates on real activity, the
     referred member's third raven, not on signup. Sybil-resistant. */
  const { count: postCount } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("deleted", false);
  if (postCount === 3) {
    const { data: ref } = await db
      .from("referrals")
      .select("referrer_id, activated")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (ref && !ref.activated) {
      await db
        .from("referrals")
        .update({ activated: true })
        .eq("profile_id", profile.id);
      await award(db, ref.referrer_id, {
        points: 60,
        glory: 30,
        reason: "banner_raised",
        ref: profile.id,
      });
      await award(db, profile.id, {
        points: 20,
        reason: "banner_answered",
      });
      await db.from("notifications").insert({
        profile_id: ref.referrer_id,
        kind: "banner_raised",
        actor_id: profile.id,
        body: "A banner you raised now flies in the realm. The reward is yours.",
      });
    }
  }

  after(async () => {
    await maybeRavenReplyToPost(db, post.id, text, profile.handle, profile.id);
    /* Tell anyone named in the raven that they were mentioned. */
    await notifyMentions(db, {
      text,
      actorId: profile.id,
      ref: post.id,
      body: text.slice(0, 140),
    });
  });

  return json({ ok: true, id: post.id, post });
}

/* Soft delete the caller's own raven. Only the author may remove a post; the
   row is kept but flagged deleted so feed reads (which filter deleted) drop
   it. Admin takedown lives on its own route. */
export async function DELETE(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return json({ error: "bad request" }, 400);

  const { data, error } = await db
    .from("posts")
    .update({ deleted: true })
    .eq("id", id)
    .eq("author_id", profile.id)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: "could not delete" }, 500);
  if (!data) return json({ error: "not your raven" }, 403);
  return json({ ok: true });
}
