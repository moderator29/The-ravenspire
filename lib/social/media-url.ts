/* The one test for "did this image come from our own media shelf".
 *
 * WHY IT IS SHARED. Four routes accept an image URL from a client and write it
 * to a row that other members will render: a raven's media, a whisper's image,
 * and a profile's avatar and banner. Each of them had its own copy of the
 * check, and the copies had drifted into two different rules. The posts and
 * whispers routes matched on the storage PATH SEGMENT; the profile route
 * compared the string against a prefix built from NEXT_PUBLIC_SUPABASE_URL.
 * The prefix version is the one that breaks: a trailing slash, a custom
 * storage domain, or any drift between the upload host and that env var and
 * every image is silently rejected (the bug that once left every post with
 * media = []). Worse, /api/profile/sync wrote avatar_url with no check at all,
 * so the allowlist one profile route enforced was walked around by the other.
 *
 * So the path-segment version wins, it lives here, and all four call it.
 *
 * WHAT IT PROVES. The value is an absolute https URL whose path resolves to
 * the public media bucket. It does not prove the object exists, and it is not
 * meant to: it proves the URL cannot point at a stranger's host, which is the
 * whole of what an allowlist can honestly claim. */

/* The public media bucket, as Supabase Storage addresses it. A URL that does
   not resolve to this path is not ours whatever host it names. */
export const MEDIA_PATH = "/storage/v1/object/public/media/";

/* True when `url` is an absolute https URL inside our own public media shelf.
   A type predicate so a caller can hand it an unknown straight off a JSON body
   and keep the narrowing. */
export function isRealmMediaUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.pathname.startsWith(MEDIA_PATH);
  } catch {
    return false;
  }
}
