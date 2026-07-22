import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/* Uploads an image to the public media shelf. Members only, 4MB cap,
   images only, stored under the uploader's id. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "no file" }, 400);
  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: "Images only (jpeg, png, webp, gif)" }, 400);
  if (file.size > MAX_BYTES)
    return json({ error: "Too heavy for a raven to carry (4MB max)" }, 400);

  const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await db.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return json({ error: "The shelf refused it. Try again." }, 500);

  const { data } = db.storage.from("media").getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl });
}
