import { ImageResponse } from "next/og";
import { fetchGoPlus, fetchHoneypot, buildReport } from "@/lib/tools/goplus";
import { WATCH_CHAINS, type WatchReport } from "@/lib/tools/watch-types";

/* Dynamic share card for a token safety report: the Defenses score, verdict
   and chain in the realm's livery. Real data only; falls back to a neutral
   "reading the wall" card when the token cannot be scored. */

export const alt = "A token safety report from The Ravenspire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
  const chainLabel = WATCH_CHAINS[chain]?.label ?? "EVM";
  const short = ADDR.test(address)
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
  const report = await readReport(chain, address);
  const serif = "ui-serif, Georgia, 'Times New Roman', Times, serif";

  const score = report?.score ?? null;
  const gold = "#C8A24C";
  const ember = "#C6633B";
  const emberDeep = "#B23B2E";
  const verdictColor =
    report == null
      ? "#8C877B"
      : report.verdict === "safe"
        ? gold
        : report.verdict === "caution"
          ? ember
          : report.verdict === "danger"
            ? emberDeep
            : "#8C877B";
  const headline = report?.headline ?? "Reading the wall";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#07070A",
          backgroundImage:
            "radial-gradient(circle at 80% 10%, rgba(200,162,76,0.18), rgba(7,7,10,0) 55%)",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: gold,
            fontSize: 26,
            letterSpacing: 8,
            fontFamily: serif,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              border: `4px solid ${gold}`,
              marginRight: 20,
              fontSize: 36,
            }}
          >
            R
          </div>
          THE RAVENSPIRE · THE WATCH
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: "#8C877B",
              fontSize: 30,
              letterSpacing: 3,
            }}
          >
            TOKEN SAFETY REPORT
          </div>
          <div
            style={{
              display: "flex",
              color: verdictColor,
              fontSize: 76,
              fontWeight: 700,
              fontFamily: serif,
              marginTop: 8,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              color: "#8C877B",
              fontSize: 32,
            }}
          >
            {short}
            {"   ·   "}
            {chainLabel}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 60 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: verdictColor, fontSize: 96, fontWeight: 700 }}>
              {score === null ? "—" : score}
              {score === null ? "" : "/100"}
            </span>
            <span style={{ color: "#8C877B", fontSize: 26, letterSpacing: 4 }}>
              DEFENSES SCORE
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
