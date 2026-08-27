import { after } from "next/server";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { award } from "@/lib/points";
import { maybeRavenReplyToPost } from "@/lib/ai/mention";
import { notifyMentions, notifyFollowers } from "@/lib/notifications";
import { emit } from "@/lib/realm/events";
import { screenAndFlag } from "@/lib/moderation/screen";
import { prepareCall, type CallInput } from "@/lib/calls/create";
import { escrowCallStake } from "@/lib/calls/escrow";
import { profileKey, rateLimit } from "@/lib/rate-limit";

/* A raven that tags the Herald. Matched here as well as in lib/ai/mention.ts
   because this route has to know, before it writes anything, whether the post
   it is about to accept will spend Anthropic budget. */
const TAGS_RAVEN = /@raven\b/i;

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Authoring costs the realm the same things a reply does (a row, a fan-out,
     a points award, a screen) and one more besides, so it is metered on the
     account exactly as /api/comments is. Sixty ravens an hour is far above any
     real composing session. */
  const rl = await rateLimit(profileKey("posts", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      {
        error: "You have sent plenty of ravens for one hour. Return shortly.",
        retryAfter: rl.retryAfter,
      },
      429
    );

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

  /* Calling the Herald is metered separately, and far tighter, because it is
     the only thing on this route that spends real money. The per-thread ceiling
     in lib/ai/mention.ts counts the Raven's replies under ONE raven, so a
     member who keeps sending fresh @raven posts mints himself a fresh quota
     every time and the thread cap never binds. This is the cap that does.
     Refused before anything is written, so a member who has spent the hour can
     still post: they simply cannot summon the Herald again with it. */
  if (TAGS_RAVEN.test(text)) {
    const heraldRl = await rateLimit(
      profileKey("posts:raven", profile.id),
      10,
      3600
    );
    if (!heraldRl.ok)
      return json(
        {
          error:
            "The Herald has answered you enough this hour. Send your raven without the summons, or return later.",
          retryAfter: heraldRl.retryAfter,
        },
        429
      );
  }

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
    const draft = await prepareCall(
      db,
      { id: profile.id, points: profile.points, house_slug: profile.house_slug },
      body.call as CallInput
    );
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

  /* The stake, escrowed the instant the Call exists.

     ORDER, AND WHY IT IS THIS WAY ROUND. The post id is the escrow's primary
     key and therefore its idempotency guarantee, so the post has to exist
     first. That leaves one window: the post is written and the escrow refuses.
     The compensation is to remove the post, which is visible, recoverable and
     leaves the member exactly where they started. The other order has a worse
     window: escrow first, then fail to insert the post, and the member's
     points are held against a Call that does not exist, silently, with no row
     anywhere naming what happened to them. An orphaned post is a bug someone
     can see. An orphaned escrow is a bug that eats a balance.

     prepareCall already refused a stake larger than the balance it was handed,
     so this path is the concurrency case and the "balance moved since
     authentication" case, not the ordinary one. */
  const sealedStake = call?.stake;
  const stake = typeof sealedStake === "number" ? sealedStake : 0;
  if (stake > 0) {
    const held = await escrowCallStake(db, {
      postId: post.id as string,
      profileId: profile.id,
      stake,
      houseSlug: profile.house_slug,
    });
    if (!held.ok) {
      await db.from("posts").update({ deleted: true }).eq("id", post.id);
      return json(
        {
          error:
            held.reason === "insufficient"
              ? "You no longer hold enough POINTS for that stake, so the Call was not sealed."
              : "The stake could not be held, so the Call was not sealed.",
        },
        409
      );
    }
  }

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
     referred member's third raven, not on signup. Sybil-resistant.

     The test is "three or more", not "exactly three". An equality test only
     ever fires on the one request that observes the count at exactly three,
     and there are two ordinary ways to miss it: a member who deletes a raven
     and writes another walks the count 3, 2, 3 without a request ever seeing
     the third as new, and two ravens landing together can both read four. The
     milestone would then be skipped forever, silently, for a member who did
     everything asked of them. `activated` is what makes the reward single use,
     so a threshold is safe where an equality is fragile. */
  const { count: postCount } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", profile.id)
    .eq("deleted", false);
  if ((postCount ?? 0) >= 3) {
    const { data: ref } = await db
      .from("referrals")
      .select("referrer_id, activated")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (ref && !ref.activated) {
      /* The flip is the guard. Only the request that actually moves activated
         from false to true pays the reward, so the widened threshold above
         cannot pay a referrer twice when two ravens land together. */
      const { data: activated } = await db
        .from("referrals")
        .update({ activated: true })
        .eq("profile_id", profile.id)
        .eq("activated", false)
        .select("profile_id");
      if (activated && activated.length > 0) {
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
  }

  after(async () => {
    /* The free spam and abuse screen (V2 section 10). It never blocks and never
       hides: the raven is already published, and a heuristic that cannot read
       intent only ever raises a flag for a moderator. */
    await screenAndFlag(db, {
      subjectType: "post",
      subjectId: post.id,
      authorId: profile.id,
      text,
      mentions: mentions.length,
      cashtags: cashtags.length,
    });
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
        stake?: number;
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
          /* A Call with POINTS behind it is a different event to read than one
             without, so the card can say so without going back for it. */
          stake: sealed.stake ?? 0,
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

  /* A Call with POINTS still held cannot be withdrawn.

     The settlement sweep only reads posts that are not deleted, so a deleted
     Call is a Call that never settles, and its escrow would sit at 'escrowed'
     forever: the member's points are gone, the House never receives its share
     of the burn, and the realm carries a liability nothing will ever clear.

     There is no profit in it (the points left the balance at seal time either
     way, so deleting a losing Call saves nothing and deleting a winning one
     forfeits the return), which is exactly why this is a correctness fix
     rather than an exploit fix. A stake is a commitment, and a commitment you
     can quietly take off the table is not one. */
  const { data: held } = await db
    .from("call_stakes")
    .select("post_id")
    .eq("post_id", id)
    .eq("status", "escrowed")
    .maybeSingle();
  if (held)
    return json(
      {
        error:
          "That Call has POINTS behind it. It stands until the realm settles it.",
      },
      409
    );

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
