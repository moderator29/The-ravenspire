import { ImageResponse } from "next/og";
import { fetchGoPlus, fetchHoneypot, buildReport } from "@/lib/tools/goplus";
import { WATCH_CHAINS, type WatchReport } from "@/lib/tools/watch-types";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
} from "@/lib/share/og";

/* A token safety report, as a share card. Moved onto the shared chassis in
 * mission 10; the verdict, the score and the refusal to invent one are
 * unchanged.
 *
 * The one card in the realm that reads a third party at request time rather
 * than the database, which is why it can honestly answer "nothing to show" for
 * a real token: a rate limited upstream is not a safe token and must never
 * render as one.
 */

export const dynamic = "force-dynamic";

export const alt = "A token safety report from The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const ADDR = /^0x[a-fA-F0-9]{40}$/;

async function readReport(
  chain: string,
  address: string
): Promise<WatchReport | null> {
  if (!WATCH_CHAINS[chain] || !ADDR.test(address)) return null;
  const addr = address.toLowerCase();
  try {
    const [goplus, honeypot] = await Promise.all([
      fetchGoPlus(chain, addr),
      fetchHoneypot(chain, addr),
    ]);
    if (goplus.status === "rate_limited") return null;
    if (!("token" in goplus) && !honeypot.reached) return null;
    return buildReport(addr, chain, goplus.token ?? {}, honeypot);
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const { chain, address } = await params;
  const report = await readReport(chain, address);

  /* No report is no card. The old version drew a "reading the wall" headline
     with a dot where the score goes, which is a safety report that says
     nothing while still looking like a safety report, and the one place in the
     product where that is genuinely dangerous: somebody could share it as
     though the token had been checked. */
  if (!report) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  const chainLabel = WATCH_CHAINS[chain]?.label ?? "EVM";
  const short = ADDR.test(address)
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
  const tone =
    report.verdict === "safe"
      ? "gold"
      : report.verdict === "danger"
        ? "ember"
        : "bone";

  return new ImageResponse(
    (
      <OgCard
        kicker="THE WATCH"
        headline={report.headline}
        subline={`${short}  ·  ${chainLabel}`}
        stats={[
          {
            label: "DEFENSES SCORE",
            value: `${report.score}/100`,
            tone,
          },
        ]}
        glow="right"
      />
    ),
    { ...size }
  );
}
