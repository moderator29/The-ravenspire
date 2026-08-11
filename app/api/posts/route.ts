import { after } from "next/server";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { maybeRavenReplyToPost } from "@/lib/ai/mention";
import { notifyMentions, notifyFollowers } from "@/lib/notifications";
import { emit } from "@/lib/realm/events";
import { prepareCall, type CallInput } from "@/lib/calls/create";

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
    call?: CallInput;
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
  /* A Call is now a claim with a category and a resolver, not only a price bet.
     Everything that decides what a Call is worth happens on the server in
     prepareCall: the sealed entry price, the frozen difficulty baseline pi_0,
     the confidence band, and the ceiling on how many Calls a member may have
     running at once. A client that sends only { token, stance, timeframe },
     which is every client shipping today, still seals exactly the Call it
     always did. */
  const wantsCall =
    !!body.call &&
    (!!body.call.token ||
      !!body.call.claim ||
      body.call.resolver === "internal" ||
      body.call.category === "realm");
  if (wantsCall) {
    const draft = await prepareCall(db, profile.id, body.call as CallInput);
    if (!draft.ok) return json({ error: draft.error }, draft.status);
    kind = "call";
    call = draft.call as unknown as Record<string, unknown>;
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

  /* Authoring is a social action, so it draws on the daily social allowance
     (V2 section 9.5, rule 4). What a Call is actually worth is not decided
     here: it is decided when the Call resolves and is scored against the
     difficulty it was frozen with. */
  await award(db, profile.id, {
    points: kind === "call" ? 8 : 5,
    glory: 2,
    reason: kind === "call" ? "sealed_a_call" : "sent_a_raven",
    ref: post.id,
    category: "social",
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
    /* Follow alert: a Call from someone you follow. */
    if (kind === "call" && call) {
      const sealed = call as {
        token?: string;
        stance?: string;
        timeframe?: string;
        category?: string;
        resolver?: string;
        confidence?: number;
        threshold?: number;
        pi_0?: number;
        entry_price?: number;
        claim?: unknown;
      };
      const tf = sealed.timeframe ?? "the window";
      const subject = sealed.token ? `$${sealed.token}` : "the realm";
      await notifyFollowers(db, {
        actorId: profile.id,
        kind: "follow_call",
        body: `called ${subject} ${sealed.stance ?? "up"} over ${tf}`,
        ref: post.id,
      });

      /* The Ravenry learns a Call was sealed. The payload carries everything a
         Call card needs so the feed never has to go back for it, including the
         frozen baseline that says how hard this Call actually is. */
      await emit(db, {
        kind: "call.sealed",
        actorId: profile.id,
        subjectType: "post",
        subjectId: post.id,
        houseSlug: profile.house_slug,
        audience: visibility === "public" ? "realm" : "followers",
        payload: {
          v: 1,
          token: sealed.token ?? null,
          stance: sealed.stance ?? null,
          timeframe: tf,
          category: sealed.category ?? "markets",
          resolver: sealed.resolver ?? "price",
          confidence: sealed.confidence ?? null,
          threshold: sealed.threshold ?? 0,
          pi_0: sealed.pi_0 ?? null,
          entry_price: sealed.entry_price ?? null,
          claim: sealed.claim ?? null,
        },
      });
    }
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
