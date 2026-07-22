import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* The Rookery courts: live rooms lifecycle. A court is a live presence and
   realtime chat experience. The audio pipeline itself arrives with the LiveKit
   key; until then courts open, gather, speak in text, and close.

   Realtime: on any change to a court's roster or status we fire a best-effort
   service-role broadcast on the court's channel so open room views update the
   instant someone joins, leaves, or the host ends the court. The directory and
   room views also poll as a guaranteed fallback. */

type HostRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type HouseRow = {
  slug: string;
  name: string;
  sigil: string | null;
  color: string | null;
};

async function broadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;
  try {
    await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: false }],
      }),
    });
  } catch {
    /* realtime is a nicety, never a requirement */
  }
}

/* Single-court detail: the host, the full roster with faces, and live status.
   Reached with ?id=<room>. Used by the room view. */
async function roomDetail(id: string) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data: room } = await db
    .from("rooms")
    .select(
      "id, host_id, title, kind, status, house_slug, started_at, ended_at, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!room) return json({ error: "No such court." }, 404);

  const [{ data: parts }, { data: host }] = await Promise.all([
    db
      .from("room_participants")
      .select("profile_id, role, joined_at")
      .eq("room_id", id)
      .order("joined_at", { ascending: true }),
    db
      .from("profiles")
      .select("id, handle, display_name, avatar_url")
      .eq("id", room.host_id as string)
      .maybeSingle(),
  ]);

  const roster = parts ?? [];
  const partIds = roster.map((p) => p.profile_id as string);
  const { data: faces } = partIds.length
    ? await db
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .in("id", partIds)
    : { data: [] as HostRow[] };

  const faceMap = new Map<string, HostRow>();
  for (const f of (faces ?? []) as HostRow[]) faceMap.set(f.id, f);

  let house: HouseRow | null = null;
  if (room.house_slug) {
    const { data: h } = await db
      .from("houses")
      .select("slug, name, sigil, color")
      .eq("slug", room.house_slug as string)
      .maybeSingle();
    house = (h as HouseRow) ?? null;
  }

  return json({
    room: {
      id: room.id,
      host_id: room.host_id,
      title: room.title,
      kind: room.kind,
      status: room.status,
      house_slug: room.house_slug,
      started_at: room.started_at,
      ended_at: room.ended_at,
      created_at: room.created_at,
      host: host
        ? {
            id: (host as HostRow).id,
            handle: (host as HostRow).handle,
            display_name: (host as HostRow).display_name,
            avatar_url: (host as HostRow).avatar_url,
          }
        : null,
      house,
      participants: roster.length,
      roster: roster.map((p) => {
        const face = faceMap.get(p.profile_id as string);
        return {
          profile_id: p.profile_id,
          role: p.role,
          joined_at: p.joined_at,
          handle: face?.handle ?? null,
          display_name: face?.display_name ?? null,
          avatar_url: face?.avatar_url ?? null,
        };
      }),
    },
  });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) return roomDetail(id);

  const db = adminClient();
  if (!db) return json({ rooms: [] });

  const { data: rooms, error } = await db
    .from("rooms")
    .select("id, host_id, title, kind, status, house_slug, started_at")
    .in("status", ["live", "scheduled"])
    .order("status", { ascending: true })
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return json({ error: error.message }, 500);
  const list = rooms ?? [];
  if (list.length === 0) return json({ rooms: [] });

  const hostIds = [...new Set(list.map((r) => r.host_id as string))];
  const roomIds = list.map((r) => r.id as string);
  const houseSlugs = [
    ...new Set(list.map((r) => r.house_slug).filter(Boolean) as string[]),
  ];

  const [{ data: hosts }, { data: parts }, { data: houses }] =
    await Promise.all([
      db
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .in("id", hostIds),
      db
        .from("room_participants")
        .select("room_id, profile_id")
        .in("room_id", roomIds),
      houseSlugs.length
        ? db
            .from("houses")
            .select("slug, name, sigil, color")
            .in("slug", houseSlugs)
        : Promise.resolve({ data: [] as HouseRow[] }),
    ]);

  const hostMap = new Map<string, HostRow>();
  for (const h of (hosts ?? []) as HostRow[]) hostMap.set(h.id, h);

  const houseMap = new Map<string, HouseRow>();
  for (const h of (houses ?? []) as HouseRow[]) houseMap.set(h.slug, h);

  const partMap = new Map<string, string[]>();
  for (const p of (parts ?? []) as { room_id: string; profile_id: string }[]) {
    const arr = partMap.get(p.room_id) ?? [];
    arr.push(p.profile_id);
    partMap.set(p.room_id, arr);
  }

  return json({
    rooms: list.map((r) => {
      const host = hostMap.get(r.host_id as string);
      const ids = partMap.get(r.id as string) ?? [];
      return {
        id: r.id,
        host_id: r.host_id,
        title: r.title,
        kind: r.kind,
        status: r.status,
        house_slug: r.house_slug,
        started_at: r.started_at,
        host: host
          ? {
              handle: host.handle,
              display_name: host.display_name,
              avatar_url: host.avatar_url,
            }
          : null,
        house: r.house_slug ? houseMap.get(r.house_slug as string) ?? null : null,
        participants: ids.length,
        participant_ids: ids,
      };
    }),
  });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json(
      { error: "Take your vows first. Finish onboarding before holding court." },
      403
    );
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: string;
    title?: string;
    room_id?: string;
    house_slug?: string | null;
    scheduled?: boolean;
  } | null;
  if (!body?.action) return json({ error: "bad request" }, 400);

  /* Validate an optional House banner against the real roster of houses so a
     court can never fly a sigil that does not exist. */
  async function resolveHouse(slug: string | null | undefined) {
    if (!slug) return null;
    const { data } = await db!
      .from("houses")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    return data ? slug : null;
  }

  if (body.action === "open" || body.action === "schedule") {
    const title = body.title?.trim().slice(0, 80);
    if (!title) return json({ error: "A court needs a name." }, 400);
    const scheduled = body.action === "schedule" || body.scheduled === true;
    const houseSlug = await resolveHouse(body.house_slug);

    if (!scheduled) {
      const { data: held } = await db
        .from("rooms")
        .select("id")
        .eq("host_id", profile.id)
        .eq("status", "live")
        .maybeSingle();
      if (held)
        return json(
          {
            error:
              "One voice, one dais. Close the court you already hold before raising another.",
          },
          409
        );
    }

    const { data: room, error } = await db
      .from("rooms")
      .insert({
        host_id: profile.id,
        title,
        kind: "audio",
        status: scheduled ? "scheduled" : "live",
        house_slug: houseSlug,
        started_at: scheduled ? null : new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !room) return json({ error: error?.message ?? "failed" }, 500);

    if (!scheduled) {
      /* Seat the host in their own court; best-effort. */
      await db.from("room_participants").insert({
        room_id: room.id,
        profile_id: profile.id,
        role: "host",
      });
    }

    return json({ id: room.id, scheduled });
  }

  if (body.action === "start") {
    if (!body.room_id) return json({ error: "bad request" }, 400);
    const { data: room } = await db
      .from("rooms")
      .select("id, host_id, status")
      .eq("id", body.room_id)
      .maybeSingle();
    if (!room) return json({ error: "No such court." }, 404);
    if (room.host_id !== profile.id)
      return json({ error: "Only the host may raise the court." }, 403);
    if (room.status === "ended")
      return json({ error: "That court has adjourned." }, 409);
    if (room.status !== "live") {
      const { error } = await db
        .from("rooms")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", room.id);
      if (error) return json({ error: error.message }, 500);
      await db
        .from("room_participants")
        .upsert(
          { room_id: room.id, profile_id: profile.id, role: "host" },
          { onConflict: "room_id,profile_id" }
        );
    }
    await broadcast(`rooms:court:${room.id}`, "presence", { status: "live" });
    return json({ ok: true });
  }

  if (body.action === "close") {
    if (!body.room_id) return json({ error: "bad request" }, 400);
    const { data: room } = await db
      .from("rooms")
      .select("id, host_id, status")
      .eq("id", body.room_id)
      .maybeSingle();
    if (!room) return json({ error: "No such court." }, 404);
    if (room.host_id !== profile.id)
      return json({ error: "Only the host may end the court." }, 403);
    if (room.status !== "ended") {
      const { error } = await db
        .from("rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", room.id);
      if (error) return json({ error: error.message }, 500);
    }
    await broadcast(`rooms:court:${room.id}`, "presence", { status: "ended" });
    return json({ ok: true });
  }

  if (body.action === "join") {
    if (!body.room_id) return json({ error: "bad request" }, 400);
    const { data: room } = await db
      .from("rooms")
      .select("id, status")
      .eq("id", body.room_id)
      .maybeSingle();
    if (!room) return json({ error: "No such court." }, 404);
    if (room.status === "ended")
      return json({ error: "That court has adjourned." }, 409);

    const { error } = await db.from("room_participants").insert({
      room_id: room.id,
      profile_id: profile.id,
      role: "listener",
    });
    /* 23505: already seated, which is fine. */
    if (error && error.code !== "23505")
      return json({ error: error.message }, 500);
    await broadcast(`rooms:court:${room.id}`, "presence", {
      joined: profile.id,
    });
    return json({ ok: true });
  }

  if (body.action === "leave") {
    if (!body.room_id) return json({ error: "bad request" }, 400);
    const { error } = await db
      .from("room_participants")
      .delete()
      .eq("room_id", body.room_id)
      .eq("profile_id", profile.id);
    if (error) return json({ error: error.message }, 500);
    await broadcast(`rooms:court:${body.room_id}`, "presence", {
      left: profile.id,
    });
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
