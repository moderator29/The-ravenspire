import { json } from "@/lib/auth/server";
import { emit } from "@/lib/realm/events";
import { grantCrest } from "@/lib/points";
import { createNotification } from "@/lib/notifications";
import {
  SEASON_CHAMPION_CREST_SLUG,
  SEASON_CHAMPION_RANKS,
} from "@/lib/realm/appointments";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

const SEASON_SELECT = "id, name, starts_at, ends_at, status, vault_raven";

/* The realm calendar. GET lists every season; POST creates a new season or
   edits, activates, or closes an existing one. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  /* Settlement view: the frozen standings for one settled season. */
  const settlementId = new URL(req.url).searchParams.get("settlement");
  if (settlementId) {
    const sid = Number(settlementId);
    if (!Number.isFinite(sid)) return json({ error: "bad_request" }, 400);
    const { data: rows, error: sErr } = await db
      .from("season_settlements")
      .select(
        "rank, points, renown, glory, settled_at, member:profiles!season_settlements_profile_id_fkey (handle, display_name, avatar_url)"
      )
      .eq("season_id", sid)
      .order("rank", { ascending: true })
      .limit(200);
    if (sErr) return json({ error: "query_failed" }, 500);
    const totalPoints = (rows ?? []).reduce(
      (sum, r) => sum + ((r.points as number) ?? 0),
      0
    );
    return json({ settlement: rows ?? [], totalPoints, count: (rows ?? []).length });
  }

  const { data, error } = await db
    .from("seasons")
    .select(SEASON_SELECT)
    .order("id", { ascending: true });
  if (error) return json({ error: "query_failed" }, 500);

  return json({ seasons: data ?? [] });
}

function toIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toId(v: unknown): number {
  return typeof v === "number"
    ? v
    : typeof v === "string"
      ? Number(v)
      : NaN;
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: {
    action?: string;
    id?: unknown;
    name?: unknown;
    starts_at?: unknown;
    ends_at?: unknown;
    vault_raven?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "";

  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "bad_request" }, 400);

    /* seasons.id has no default; take the next integer after the highest. */
    const { data: last } = await db
      .from("seasons")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextId = ((last?.id as number | undefined) ?? 0) + 1;

    const vault =
      body.vault_raven == null || body.vault_raven === ""
        ? 0
        : Math.max(0, Math.trunc(Number(body.vault_raven)));

    const { data: created, error } = await db
      .from("seasons")
      .insert({
        id: nextId,
        name,
        starts_at: toIso(body.starts_at),
        ends_at: toIso(body.ends_at),
        status: "upcoming",
        vault_raven: Number.isFinite(vault) ? vault : 0,
      })
      .select(SEASON_SELECT)
      .single();
    if (error) return json({ error: "create_failed" }, 500);

    await logAdminAction(db, profile.id, "season_create", {
      targetType: "season",
      targetId: nextId,
      payload: { name },
    });
    return json({ ok: true, season: created });
  }

  const id = toId(body.id);
  if (!Number.isFinite(id)) return json({ error: "bad_request" }, 400);

  if (action === "edit") {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim();
    if ("starts_at" in body) patch.starts_at = toIso(body.starts_at);
    if ("ends_at" in body) patch.ends_at = toIso(body.ends_at);
    if (body.vault_raven != null && body.vault_raven !== "") {
      const v = Math.trunc(Number(body.vault_raven));
      if (Number.isFinite(v)) patch.vault_raven = Math.max(0, v);
    }
    if (Object.keys(patch).length === 0)
      return json({ error: "bad_request" }, 400);

    const { data: updated, error } = await db
      .from("seasons")
      .update(patch)
      .eq("id", id)
      .select(SEASON_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    await logAdminAction(db, profile.id, "season_edit", {
      targetType: "season",
      targetId: id,
      payload: patch,
    });
    return json({ ok: true, season: updated });
  }

  if (action === "settle") {
    /* THE SEASON CLOSE, and it is no longer written here.
     *
     * This used to freeze season_settlements from a query in this route. Two
     * things were wrong with that and both were invisible until the realm grew
     * a clock:
     *
     *   It ranked the season by POINTS, which is a lifetime balance that never
     *   resets. Ranking a season by a number that only accumulates means the
     *   top of every season's table is the same people in the same order
     *   forever, and the rank measures how long somebody has been here rather
     *   than what they did this season. A season is ranked by the season's own
     *   currency, which is Glory.
     *
     *   It froze the standings and reset nothing, so a season closing changed
     *   a status field and nothing else. Every House kept its Glory, so the
     *   House that led in month one led forever.
     *
     * public.close_season does both, in one transaction, because the reset
     * destroys exactly the numbers the freeze is recording and a crash between
     * them is unrepairable: the evidence is what would be gone. The scheduled
     * clock job calls the same function, so the realm has one settlement path
     * and cannot hold two opinions about who won a season.
     *
     * p_force is true here and only here. A steward pressing this button means
     * "close it now", before its own end date if need be. It does NOT mean
     * "close it again": the function refuses any season that is not still
     * active, whatever force says, because a second close would upsert the
     * frozen record with the zeroes the first one wrote. */
    const { data: verdict, error: closeErr } = await db.rpc("close_season", {
      p_season_id: id,
      p_champion_ranks: SEASON_CHAMPION_RANKS,
      p_force: true,
    });
    if (closeErr) return json({ error: "settle_failed" }, 500);

    const out = (verdict ?? {}) as {
      closed?: boolean;
      reason?: string;
      status?: string;
      members?: number;
      total_points?: number;
      champions?: { profile_id: string; rank: number }[];
    };

    if (!out.closed) {
      if (out.reason === "not_found") return json({ error: "not_found" }, 404);
      return json(
        {
          error:
            out.reason === "not_active"
              ? `That season is already ${out.status ?? "closed"}.`
              : "That season cannot be settled.",
          reason: out.reason ?? "refused",
        },
        409
      );
    }

    const members = out.members ?? 0;
    const totalPoints = out.total_points ?? 0;
    const champions = out.champions ?? [];

    /* The crests, granted outside the transaction on purpose: the close has to
       be indivisible, a crest grant does not, and a failed notification insert
       must never roll back a whole season's settlement. Idempotent by
       user_crests' own key, and the champions were read back out of the frozen
       rows so the crest and the record name the same members. */
    for (const champion of champions) {
      if (!champion?.profile_id) continue;
      const { data: held } = await db
        .from("user_crests")
        .select("crest_slug")
        .eq("profile_id", champion.profile_id)
        .eq("crest_slug", SEASON_CHAMPION_CREST_SLUG)
        .maybeSingle();
      await grantCrest(db, champion.profile_id, SEASON_CHAMPION_CREST_SLUG);
      if (held) continue;
      /* B3: through createNotification, so the realtime nudge fires. The crest
         slug in ref is why notifications.subject_id had to become text
         (20260828093353); as a uuid column it rejected the slug with 22P02. */
      await createNotification(db, {
        profile_id: champion.profile_id,
        kind: "crest",
        ref: SEASON_CHAMPION_CREST_SLUG,
        body: `You finished among the highest when the season closed and earned the Champion of the Season crest.`,
      });
      await emit(db, {
        kind: "crest.earned",
        actorId: champion.profile_id,
        subjectType: "crest",
        subjectId: SEASON_CHAMPION_CREST_SLUG,
        payload: {
          v: 1,
          crest_slug: SEASON_CHAMPION_CREST_SLUG,
          title: "Champion of the Season",
          season_id: id,
          rank: champion.rank,
        },
      });
    }

    const { data: updated } = await db
      .from("seasons")
      .select(SEASON_SELECT)
      .eq("id", id)
      .maybeSingle();

    /* The realm hears the season close. This is the one reward announcement
       the product can make honestly: the figures are server settled, frozen in
       season_settlements, and aggregate. A per member payout card is
       deliberately not emitted, because publishing one member's earned balance
       to the realm is a privacy decision nobody has made and rule 7 constrains
       how a balance may be shown at all.

       Once only, keyed on the season, so a close and the clock job racing each
       other cannot announce the same close twice. */
    await emit(db, {
      kind: "season.milestone",
      subjectType: "season",
      subjectId: `season:${id}:settled`,
      payload: {
        v: 1,
        phase: "settled",
        season_id: id,
        members,
        total_points: totalPoints,
        champions: champions.length,
      },
    });

    await logAdminAction(db, profile.id, "season_settle", {
      targetType: "season",
      targetId: id,
      payload: { members, totalPoints, champions: champions.length },
    });
    return json({
      ok: true,
      season: updated,
      settled: members,
      totalPoints,
      champions: champions.length,
    });
  }

  if (action === "activate" || action === "close") {
    const status = action === "activate" ? "active" : "closed";
    const { data: updated, error } = await db
      .from("seasons")
      .update({ status })
      .eq("id", id)
      .select(SEASON_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    /* A world event: the realm's calendar turning, with no member behind it.
       This is the producer season.milestone has been missing since the spine
       was written, which is why the kind was defined and nothing drew it. */
    await emit(db, {
      kind: "season.milestone",
      subjectType: "season",
      subjectId: `season:${id}:${action === "activate" ? "opened" : "closed"}`,
      payload: {
        v: 1,
        phase: action === "activate" ? "opened" : "closed",
        season_id: id,
        name: (updated as { name?: string }).name ?? null,
        starts_at: (updated as { starts_at?: string }).starts_at ?? null,
        ends_at: (updated as { ends_at?: string }).ends_at ?? null,
      },
    });

    await logAdminAction(db, profile.id, `season_${action}`, {
      targetType: "season",
      targetId: id,
      payload: { status },
    });
    return json({ ok: true, season: updated });
  }

  return json({ error: "bad_request" }, 400);
}
