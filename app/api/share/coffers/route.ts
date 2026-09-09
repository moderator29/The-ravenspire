import { createElement } from "react";
import { ImageResponse } from "next/og";
import { requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { getFlag } from "@/lib/flags";
import { loadPointsSide } from "@/lib/economy/coffers";
import { houseBySlug } from "@/lib/data/houses";
import { OgCard, OG_CONTENT_TYPE, OG_GENERIC, OG_SIZE } from "@/lib/share/og";
import { renderCoffersCard } from "@/lib/share/render";

/* A member's own Coffers, as a downloadable card. Session-only: unlike every
 * other card in the set, there is no id parameter here and there never will
 * be one, because unlike a Call or a Keep, this figure is not meant to
 * unfurl for a stranger holding a link. See lib/share/render.ts's
 * renderCoffersCard for the full reasoning.
 *
 * The generic card, not an error, for every way this can decline: no
 * session, the Coffers sealed behind coffers_live, the rate limit spent. A
 * broken image is a worse failure than the realm's own honest placeholder,
 * on the one surface in this feature a member's own client actually renders
 * inline rather than only a crawler ever seeing.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) {
    return new ImageResponse(createElement(OgCard, OG_GENERIC), { ...OG_SIZE });
  }

  const db = adminClient();
  if (!db || !(await getFlag("coffers_live"))) {
    return new ImageResponse(createElement(OgCard, OG_GENERIC), { ...OG_SIZE });
  }

  const rl = await rateLimit(profileKey("share-coffers", profile.id), 30, 3600);
  if (!rl.ok) {
    return new ImageResponse(createElement(OgCard, OG_GENERIC), { ...OG_SIZE });
  }

  if (!profile.handle) {
    return new ImageResponse(createElement(OgCard, OG_GENERIC), { ...OG_SIZE });
  }

  const points = await loadPointsSide(db, profile.id, profile.points);
  const house = houseBySlug(profile.house_slug ?? null);

  const props = renderCoffersCard({
    name: profile.display_name ?? `@${profile.handle}`,
    handle: profile.handle,
    tier: profile.tier ?? null,
    houseName: house?.name ?? null,
    statement: points.statement,
    glory: points.glory,
  });

  return new ImageResponse(createElement(OgCard, props), {
    ...OG_SIZE,
    headers: { "content-type": OG_CONTENT_TYPE },
  });
}
