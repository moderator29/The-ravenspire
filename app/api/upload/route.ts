import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/* What the bytes say they are, which is the only thing this route believes.
   `file.type` is whatever the browser (or the script) attached to the part: it
   is a claim, not a measurement, and a claim is enough to park an HTML file or
   an SVG on a public, permanently-hosted origin under an image content type
   and hand its URL to the realm. The four formats below are exactly the four
   the allowlist admits, and each is recognised by the signature its own
   specification defines.

   Enough of the head to see all four: a WEBP is only identifiable at byte 8,
   where the RIFF container names its form. */
const SNIFF_BYTES = 16;

function startsWith(bytes: Uint8Array, sig: number[], at = 0): boolean {
  if (bytes.length < at + sig.length) return false;
  return sig.every((b, i) => bytes[at + i] === b);
}

/* The real content type of `head`, or null when it is none of the four. */
function sniffImageType(head: Uint8Array): string | null {
  /* JPEG: SOI marker, then any marker byte. */
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  /* PNG: the eight byte signature, newline pair and all. */
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  /* GIF: "GIF87a" or "GIF89a". */
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) {
    const v = head[4];
    if ((v === 0x37 || v === 0x39) && head[5] === 0x61) return "image/gif";
    return null;
  }
  /* WEBP: a RIFF container whose form type at byte 8 is "WEBP". */
  if (
    startsWith(head, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return "image/webp";
  return null;
}

/* Uploads an image to the public media shelf. Members only, 4MB cap,
   images only, stored under the uploader's id. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: storage is the one resource here that never shrinks. 60 images an hour
     is far above any real composing session and far below a filled bucket. */
  const rl = await rateLimit(profileKey("upload", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      {
        error: "The shelf is full for now. Try again within the hour.",
        retryAfter: rl.retryAfter,
      },
      429
    );

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "no file" }, 400);
  if (!ALLOWED[file.type])
    return json({ error: "Images only (jpeg, png, webp, gif)" }, 400);
  if (file.size > MAX_BYTES)
    return json({ error: "Too heavy for a raven to carry (4MB max)" }, 400);

  /* The head first, so a file that is not an image at all is turned away
     before the whole of it is read into memory. */
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed)
    return json({ error: "Images only (jpeg, png, webp, gif)" }, 400);
  /* A declared type that disagrees with the bytes is not a format we correct
     for the uploader: it is either a broken client or a deliberate dress-up,
     and neither is worth hosting. */
  if (sniffed !== file.type)
    return json(
      { error: "That file is not the kind of image it claims to be" },
      400
    );

  /* Both derived from the signature, never from the claim. */
  const ext = ALLOWED[sniffed];
  const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await db.storage
    .from("media")
    .upload(path, bytes, { contentType: sniffed, upsert: false });
  if (error) return json({ error: "The shelf refused it. Try again." }, 500);

  const { data } = db.storage.from("media").getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl });
}
