import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Edit the caller's own profile: name, bio, links, portraits. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    handle?: unknown;
    display_name?: unknown;
    bio?: unknown;
    links?: unknown;
    avatar_url?: unknown;
    banner_url?: unknown;
  } | null;
  if (!body) return json({ error: "bad request" }, 400);

  const update: Record<string, unknown> = {};

  /* A member can change their username. It stays unique across the realm:
     Supabase is asked whether any other profile already holds it. */
  if (body.handle !== undefined) {
    if (typeof body.handle !== "string")
      return json({ error: "handle must be text" }, 400);
    const handle = body.handle.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,20}$/.test(handle))
      return json({ error: "Handle must be 3 to 20 characters, a-z 0-9 _" }, 400);
    if (handle === "raven")
      return json({ error: "That name belongs to the Herald." }, 400);
    if (handle !== profile.handle) {
      const { data: taken } = await db
        .from("profiles")
        .select("id")
        .ilike("handle", handle)
        .neq("id", profile.id)
        .maybeSingle();
      if (taken) return json({ error: "That handle is already claimed" }, 409);
      update.handle = handle;
    }
  }

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string")
      return json({ error: "display_name must be text" }, 400);
    const name = body.display_name.trim();
    if (!name) return json({ error: "A name is required" }, 400);
    if (name.length > 40)
      return json({ error: "Display name must be 40 characters or fewer" }, 400);
    update.display_name = name;
  }

  if (body.bio !== undefined) {
    if (typeof body.bio !== "string")
      return json({ error: "bio must be text" }, 400);
    if (body.bio.length > 280)
      return json({ error: "Bio must be 280 characters or fewer" }, 400);
    update.bio = body.bio.trim() || null;
  }

  if (body.links !== undefined) {
    if (!Array.isArray(body.links) || body.links.length > 3)
      return json({ error: "Links must be a list of at most 3" }, 400);
    const links: { label: string; url: string }[] = [];
    for (const raw of body.links) {
      if (typeof raw !== "object" || raw === null)
        return json({ error: "Each link needs a label and a url" }, 400);
      const { label, url } = raw as { label?: unknown; url?: unknown };
      if (typeof label !== "string" || typeof url !== "string")
        return json({ error: "Each link needs a label and a url" }, 400);
      const trimmedLabel = label.trim();
      if (!trimmedLabel || trimmedLabel.length > 40)
        return json({ error: "Link labels must be 1 to 40 characters" }, 400);
      if (!url.startsWith("https://") || url.length > 300)
        return json({ error: "Link urls must start with https://" }, 400);
      links.push({ label: trimmedLabel, url });
    }
    update.links = links;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const mediaPrefix = `${supabaseUrl ?? ""}/storage/v1/object/public/media/`;
  for (const key of ["avatar_url", "banner_url"] as const) {
    const val = body[key];
    if (val === undefined) continue;
    if (typeof val !== "string")
      return json({ error: `${key} must be text` }, 400);
    if (val === "") {
      update[key] = null;
      continue;
    }
    if (!supabaseUrl || !val.startsWith(mediaPrefix))
      return json({ error: "Images must come from the realm's media shelf" }, 400);
    update[key] = val;
  }

  if (Object.keys(update).length === 0)
    return json({ error: "Nothing to update" }, 400);

  const { error } = await db
    .from("profiles")
    .update(update)
    .eq("id", profile.id);
  if (error) return json({ error: "The scribe's quill broke. Try again." }, 500);
  return json({ ok: true });
}
