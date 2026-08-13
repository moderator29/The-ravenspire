import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { EMPTY_HOARD, hoardVisible, readHoard } from "@/lib/collectibles/hoard";

/* GET /api/hoard?handle=... : somebody else's collection.
 *
 * The Show beat. A collection nobody else can see is a spreadsheet, so the
 * Hoard is public by default and it is the one surface in the collectibles
 * realm built to be looked at rather than acted on. There are no claim
 * controls here and no inventory ids to act with: a viewer sees what a member
 * holds, not a handle on it.
 *
 * The privacy gate is server side, the same shape and the same default as the
 * gates in /api/profile/earnings: shown unless the member has explicitly said
 * otherwise. A sealed Hoard answers 200 with `sealed: true` and no cards,
 * because "this member keeps their collection private" is a real state a Keep
 * should be able to render, and a 403 would leave it guessing.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const handle = new URL(req.url).searchParams.get("handle")?.trim().replace(/^@/, "");
  if (!handle) return json({ error: "missing handle" }, 400);

  /* The viewer is optional: a Keep is public, so an anonymous reader sees
     exactly what a signed-in stranger sees. */
  const viewer = await getProfile(req);

  const { data: target, error } = await db
    .from("profiles")
    .select("id, handle, settings")
    .eq("handle", handle)
    .maybeSingle();
  if (error) return json({ error: "unavailable" }, 503);
  if (!target) return json({ error: "not found" }, 404);

  /* The owner always sees their own, sealed or not. A privacy setting hides a
     collection from the realm, never from its keeper. */
  const isOwner = viewer?.id === target.id;
  if (!isOwner && !hoardVisible(target.settings)) {
    return json({ ...EMPTY_HOARD, sealed: true });
  }

  try {
    const hoard = await readHoard(db, target.id as string);
    return json({ ...hoard, sealed: false });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
