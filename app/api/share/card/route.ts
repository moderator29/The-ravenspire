import { createElement } from "react";
import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { parseShareTarget } from "@/lib/share/links";
import { renderShareCard } from "@/lib/share/render";

/* THE APP'S OWN SHARE CARD ENDPOINT, distinct from the seven opengraph-image
 * routes even though it renders the exact same cards through the exact same
 * lib/share/render.ts.
 *
 * WHY A SECOND ROUTE FOR THE SAME IMAGE. Next's opengraph-image.tsx convention
 * is built for link unfurling: a crawler follows the page's own URL and Next
 * serves the image at a path the framework generates and can change a build
 * suffix on. That is invisible to a crawler, which never constructs the URL
 * itself, but it makes the convention unusable for anything the app's own
 * client code needs to link to directly, which is exactly what the share sheet
 * (components/share/share-sheet.tsx) needs: a stable `<img src>` for the live
 * preview, and the same URL again behind the Save button. This route is that
 * stable, hand-constructible address: `/api/share/card?kind=call&id=...`.
 *
 * NO NEW DISCLOSURE. This calls the same renderShareCard() over the same
 * privacy-gated subjects.ts readers the opengraph-image routes call, through
 * the same parseShareTarget() validators sharePath itself trusts. Anything
 * visible here was already visible at the equivalent opengraph-image URL.
 *
 * UNAUTHENTICATED, on purpose and consistent with the routes it mirrors: a
 * share card's whole job is to be readable by whoever holds the link, which is
 * why lib/share/subjects.ts gates each reader on the subject's own privacy
 * flags rather than on who is asking.
 *
 * DYNAMIC, NOT CACHED, the same privacy decision every opengraph-image route
 * in this feature already makes and for the same reason: a member who seals
 * their Hoard mid-session should not find the share sheet still showing the
 * open version from a cache.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = parseShareTarget(url.searchParams);
  if (!target) {
    return new Response("Not found", { status: 404 });
  }

  const props = await renderShareCard(target);
  return new ImageResponse(createElement(OgCard, props), {
    ...OG_SIZE,
    headers: { "content-type": OG_CONTENT_TYPE },
  });
}
