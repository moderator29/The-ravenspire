import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
  ogNumber,
  ogTrim,
  type OgStat,
} from "@/lib/share/og";
import { readCallSubject } from "@/lib/share/subjects";

/* A Call, as a share card. The one the realm most wants shared.
 *
 * A resolved Call is the only thing this product makes that a stranger can
 * judge without joining: a member said a thing in public, before the fact, with
 * a number attached, and the realm scored it. That is the whole argument for
 * Renown compressed into one image, and it is why this route exists.
 *
 * THE VERDICT IS NEVER DRESSED UP. A miss shows MISS, in ember, at the same
 * weight a hit shows HIT. A share card that only unfurls flatteringly is a
 * highlight reel, and a highlight reel is worth nothing as evidence, which
 * makes it worth nothing as distribution either. The score is the settlement's
 * own number and is absent while a Call is still open, because there is no
 * score yet and inventing a provisional one would be inventing data.
 */

export const dynamic = "force-dynamic";

export const alt = "A Call on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = await readCallSubject(id);

  if (!call) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  const stats: OgStat[] = [];
  if (call.score !== null) {
    stats.push({
      label: "RENOWN",
      value: ogNumber(call.score),
      tone: call.verdict === "miss" ? "ember" : "gold",
    });
  }
  if (call.confidence !== null) {
    stats.push({
      label: "CONFIDENCE",
      value: `${call.confidence}%`,
      tone: "bone",
    });
  }
  if (call.threshold !== null) {
    stats.push({
      label: "MOVE REQUIRED",
      value: `${call.threshold}%`,
      tone: "bone",
    });
  }

  const verdict =
    call.verdict === "hit"
      ? { label: "HIT", tone: "gold" as const }
      : call.verdict === "miss"
        ? { label: "MISS", tone: "ember" as const }
        : call.verdict === "void"
          ? { label: "VOID", tone: "steel" as const }
          : { label: "OPEN", tone: "steel" as const };

  return new ImageResponse(
    (
      <OgCard
        kicker={call.verdict === "open" ? "A CALL, SEALED" : "A CALL, RESOLVED"}
        headline={`${call.token} ${call.stance}`}
        subline={
          call.callerHandle
            ? `${call.callerName}  ·  @${call.callerHandle}`
            : call.callerName
        }
        body={ogTrim(call.rationale, 150)}
        stats={stats}
        verdict={verdict}
        glow="left"
      />
    ),
    { ...size }
  );
}
