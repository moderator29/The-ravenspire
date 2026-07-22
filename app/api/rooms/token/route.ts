import crypto from "node:crypto";
import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Mint a LiveKit access token so a member can join a court's real audio stage.
   Non-forgeable: the token is an HS256 JWT signed server-side with the LiveKit
   API secret, scoped to one room, with publish rights only for the host and
   promoted speakers (everyone else listens). We sign the JWT by hand so no
   server SDK dependency is needed.

   Honest degradation: when LiveKit is not configured we return configured:false
   and the UI says the audio stage is warming up rather than failing opaquely. */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  name: string,
  room: string,
  canPublish: boolean
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    nbf: now - 5,
    exp: now + 6 * 3600,
    name,
    video: {
      room,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const sig = base64url(
    crypto.createHmac("sha256", apiSecret).update(data).digest()
  );
  return `${data}.${sig}`;
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return json(
      {
        configured: false,
        error: "The audio stage is warming up. Live voice is not connected yet.",
      },
      503
    );
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as { room_id?: string } | null;
  const roomId = body?.room_id;
  if (!roomId) return json({ error: "bad request" }, 400);

  const { data: room } = await db
    .from("rooms")
    .select("id, host_id, status")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return json({ error: "No such court." }, 404);
  if (room.status === "ended")
    return json({ error: "That court has adjourned." }, 409);

  const isHost = room.host_id === profile.id;

  // Ensure the member is seated (best effort); listeners auto-join.
  if (!isHost) {
    await db
      .from("room_participants")
      .insert({ room_id: roomId, profile_id: profile.id, role: "listener" })
      .then(
        () => undefined,
        () => undefined
      );
  }

  // Publish rights: host or a promoted speaker.
  let canPublish = isHost;
  if (!isHost) {
    const { data: part } = await db
      .from("room_participants")
      .select("role")
      .eq("room_id", roomId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    canPublish = part?.role === "speaker" || part?.role === "host";
  }

  const name = profile.display_name ?? profile.handle ?? "A member";
  const token = signToken(
    apiKey,
    apiSecret,
    profile.id,
    name,
    roomId,
    canPublish
  );

  return json({ configured: true, token, url, canPublish, identity: profile.id });
}
