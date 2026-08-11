import { createBrowserClient } from "@supabase/ssr";

/* The browser Supabase client.
 *
 * This used to assert both env vars with `!`, which meant `createBrowserClient`
 * threw the moment either was absent. Because client components are still
 * evaluated while Next prerenders static pages, a deployment target missing
 * those values did not fail at runtime with a useful message, it failed the
 * entire build with an opaque error during static generation.
 *
 * That is a bad trade: the values are only ever needed in a real browser, but
 * their absence was breaking a step that never talks to Supabase at all.
 *
 * So the two cases are separated. During prerender, where there is no browser
 * and no request to serve, a placeholder is enough to let the page render its
 * markup. In an actual browser, missing configuration throws immediately and
 * says exactly what is missing, which is louder and more useful than a build
 * that silently never shipped.
 */

const PRERENDER_URL = "http://localhost:54321";
const PRERENDER_KEY = "prerender-placeholder";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window === "undefined") {
      /* Static generation. Nothing here will issue a request, and the markup
         does not depend on the connection, so let the build finish. */
      return createBrowserClient(PRERENDER_URL, PRERENDER_KEY);
    }
    throw new Error(
      "The Archives are not configured. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set for this deployment."
    );
  }

  return createBrowserClient(url, key);
}
