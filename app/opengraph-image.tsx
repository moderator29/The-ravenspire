import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";

/* The realm's own card, for every link that is not about one subject.
 *
 * It used to draw its own frame, at its own scale, with a 172px mark and a 92px
 * wordmark that appeared nowhere else in the product. It now uses the same
 * chassis every other card uses, so a timeline holding a Keep, a Call and this
 * one reads as three cards from one place rather than three products.
 *
 * It also used to be dead. app/layout.tsx set `openGraph.images` in config, and
 * Next only lets a file-based image win when the same segment's metadata does
 * not name one, so this file has never reached a crawler. See the note in
 * app/layout.tsx.
 */

export const alt =
  "The Ravenspire. Make the call. Earn your name.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        kicker=""
        headline="The Ravenspire"
        subline="Make the call. Earn your name."
        body="A competitive realm of Houses, Calls, Crests and Renown, where standing is earned and never bought."
      />
    ),
    { ...size }
  );
}
