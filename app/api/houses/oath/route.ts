import { after } from "next/server";
import { getProfile, json, requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { houseBySlug, houses } from "@/lib/data/houses";
import { emit } from "@/lib/realm/events";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import {
  blockMessage,
  loadOathHistory,
  oathEligibility,
  oathSpan,
} from "@/lib/houses/oath";

/* Oaths: the public history, and swearing a new one.
 *
 * GET  ?profile=<id>   one member's oath history, public.
 *      no query        the caller's history plus whether they may swear now.
 * POST { house }       swear a new oath.
 *
 * The rules are in lib/houses/oath.ts and are enforced here, on the server,
 * against the season calendar. The client shows them; it never decides them. */

export const dynamic = "force-dynamic";

function historyPayload(
  rows: Awaited<ReturnType<typeof loadOathHistory>>
) {
  return rows.map((row) => {
    const meta = houseBySlug(row.house_slug);
    return {
      id: row.id,
      house_slug: row.house_slug,
      house_name: meta?.name ?? row.house_slug,
      color: meta?.color ?? null,
      role: row.role,
      span: oathSpan(row),
      sworn_at: row.sworn_at,
      left_at: row.left_at,
      season_id: row.season_id,
      left_season_id: row.left_season_id,
      current: row.left_at === null,
    };
  });
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const target = new URL(req.url).searchParams.get("profile");
  if (target) {
    /* A public history. Anyone may read anyone's, which is the point: an oath
       is a public commitment, and the record of who stood where and when is
       part of what makes switching cost something. */
    const history = await loadOathHistory(db, target);
    return json({ oaths: historyPayload(history) });
  }

  const profile = await getProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const eligibility = await oathEligibility(db, profile.id);

  /* House crests the member holds under their current banner. These become
     Legacy the moment they swear elsewhere, so the warning can name them
     instead of describing them in the abstract. */
  const { data: crestRows } = await db
    .from("user_crests")
    .select("crest_slug, house_slug, legacy")
    .eq("profile_id", profile.id)
    .not("house_slug", "is", null);

  return json({
    oaths: historyPayload(eligibility.history),
    current: eligibility.current
      ? {
          house_slug: eligibility.current.house_slug,
          season_id: eligibility.current.season_id,
          role: eligibility.current.role,
          sworn_at: eligibility.current.sworn_at,
        }
      : null,
    allowed: eligibility.allowed,
    reason: eligibility.reason,
    message: eligibility.reason
      ? blockMessage(eligibility.reason, eligibility)
      : null,
    season: {
      active: eligibility.window.active
        ? {
            id: eligibility.window.active.id,
            name: eligibility.window.active.name,
            ends_at: eligibility.window.active.ends_at,
          }
        : null,
      off_season: eligibility.window.offSeason,
      next_id: eligibility.seasonId,
      earliest_switch: eligibility.earliestSeason,
    },
    house_crests: (crestRows ?? []).filter(
      (c) => c.house_slug === eligibility.current?.house_slug && !c.legacy
    ),
  });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* An oath is rate limited even though the season rules already bound it to
     roughly once a season: the eligibility read and the writes below are not
     one transaction, and a burst of concurrent requests must not be able to
     race past the one-open-oath index into a confusing half state. */
  const limit = await rateLimit(profileKey("oath", profile.id), 5, 3600);
  if (!limit.ok)
    return json({ error: "rate_limited", retryAfter: limit.retryAfter }, 429);

  const body = (await req.json().catch(() => null)) as {
    house?: string;
  } | null;
  const target = body?.house?.toLowerCase().trim();
  if (!target || !houses.some((h) => h.slug === target))
    return json({ error: "Choose a House of the realm" }, 400);

  const eligibility = await oathEligibility(db, profile.id);
  if (eligibility.current?.house_slug === target)
    return json(
      { error: blockMessage("same_house", eligibility), reason: "same_house" },
      409
    );
  if (!eligibility.allowed) {
    const reason = eligibility.reason ?? "no_current_oath";
    return json(
      { error: blockMessage(reason, eligibility), reason },
      409
    );
  }

  const current = eligibility.current;
  const seasonId = eligibility.seasonId;
  if (!current || seasonId === null)
    return json({ error: "No oath to change" }, 409);

  const now = new Date().toISOString();

  /* Close the old oath. left_season_id is the last season it covered, which is
     the season that just ended, not the one about to open. */
  const closingSeason =
    eligibility.window.latest?.id ?? current.season_id ?? seasonId;
  const { error: closeErr } = await db
    .from("house_members")
    .update({
      left_at: now,
      left_season_id: closingSeason,
      /* A title belongs to the House that granted it. It does not travel. */
      role: "sworn",
    })
    .eq("id", current.id)
    .is("left_at", null);
  if (closeErr) return json({ error: "Could not release the old oath" }, 500);

  const { error: openErr } = await db.from("house_members").insert({
    profile_id: profile.id,
    house_slug: target,
    role: "sworn",
    sworn_at: now,
    season_id: seasonId,
  });
  if (openErr) {
    /* Put the member back where they were rather than leaving them houseless. */
    await db
      .from("house_members")
      .update({ left_at: null, left_season_id: null })
      .eq("id", current.id);
    return json({ error: "Could not swear the new oath" }, 500);
  }

  await db
    .from("profiles")
    .update({ house_slug: target })
    .eq("id", profile.id);

  /* House crests earned under the old banner become Legacy: still held, still
     shown, no longer live, and unearnable again unless the member returns.
     Returning to a House un-flags them, which is the whole reason the rule is
     "cannot be re-earned unless you return" rather than "are lost". */
  await db
    .from("user_crests")
    .update({ legacy: true })
    .eq("profile_id", profile.id)
    .eq("house_slug", current.house_slug);
  await db
    .from("user_crests")
    .update({ legacy: false })
    .eq("profile_id", profile.id)
    .eq("house_slug", target);

  /* Membership counters, kept honest on both sides. */
  for (const slug of [current.house_slug, target]) {
    const { count } = await db
      .from("house_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("house_slug", slug)
      .is("left_at", null);
    await db
      .from("houses")
      .update({ member_count: count ?? 0 })
      .eq("slug", slug);
  }

  const fromMeta = houseBySlug(current.house_slug);
  const toMeta = houseBySlug(target);

  after(async () => {
    await emit(db, {
      kind: "oath.sworn",
      actorId: profile.id,
      subjectType: "house",
      subjectId: `${target}:${seasonId}`,
      houseSlug: target,
      payload: {
        v: 1,
        from: current.house_slug,
        from_name: fromMeta?.name ?? current.house_slug,
        to: target,
        to_name: toMeta?.name ?? target,
        season_id: seasonId,
      },
    });
  });

  const history = await loadOathHistory(db, profile.id);
  return json({
    ok: true,
    house: target,
    season_id: seasonId,
    oaths: historyPayload(history),
  });
}
