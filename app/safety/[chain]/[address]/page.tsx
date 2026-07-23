import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { RavenMark } from "@/components/brand/raven-mark";
import { fetchGoPlus, fetchHoneypot, buildReport } from "@/lib/tools/goplus";
import {
  WATCH_CHAINS,
  type WatchReport,
  type WatchCheck,
  type CheckGroup,
} from "@/lib/tools/watch-types";

/* SHAREABLE WATCH REPORT — a public, read-only safety verdict for a token,
   drawn from the same live GoPlus + honeypot.is reads the in-app Watch uses.
   It lives OUTSIDE the (shell) group on purpose so a shared link opens for
   anyone, member or not, and carries an OG card (opengraph-image.tsx) for a
   rich preview. Real data only; an unreadable token 404s rather than inventing
   a verdict. */

export const revalidate = 120;

const ADDR = /^0x[a-fA-F0-9]{40}$/;

const GROUPS: { id: CheckGroup; label: string }[] = [
  { id: "contract", label: "Contract" },
  { id: "trading", label: "Trading" },
  { id: "holders", label: "Holders and liquidity" },
];

const statusColor: Record<WatchCheck["status"], string> = {
  pass: "text-gold",
  caution: "text-ember",
  risk: "text-ember-deep",
  unknown: "text-bone-faint",
};

const statusIcon: Record<WatchCheck["status"], string> = {
  pass: "shield",
  caution: "eye",
  risk: "flame",
  unknown: "search",
};

const verdictStyle: Record<WatchReport["verdict"], string> = {
  safe: "text-gold",
  caution: "text-ember",
  danger: "text-ember-deep",
  unknown: "text-bone-faint",
};

function shortHex(value: string): string {
  return ADDR.test(value) ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

/* Read the live report the same way the /api/watch route does. Null when the
   token cannot be honestly scored (unreachable, not indexed, rate limited). */
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
    if (goplus.status === "unreachable" && !honeypot.reached) return null;
    if (goplus.status === "not_found" && !honeypot.reached) return null;
    if (goplus.status === "pending" && !honeypot.reached) return null;
    return buildReport(addr, chain, goplus.token ?? {}, honeypot);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}): Promise<Metadata> {
  const { chain, address } = await params;
  const chainLabel = WATCH_CHAINS[chain]?.label ?? "EVM";
  const short = shortHex(address);
  const report = await readReport(chain, address);
  const title = `Safety report · ${short} · The Ravenspire`;
  const description = report
    ? `${report.headline} — Defenses score ${report.score}/100 on ${chainLabel}. Read the full on-chain safety check on The Ravenspire.`
    : `On-chain token safety report on ${chainLabel}, read through The Ravenspire's Watch.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SafetyReportPage({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const { chain, address } = await params;
  if (!WATCH_CHAINS[chain] || !ADDR.test(address)) notFound();

  const report = await readReport(chain, address);
  const chainLabel = WATCH_CHAINS[chain].label;
  const short = shortHex(address);
  const score = report?.score ?? 0;
  const scoreColor =
    score >= 70 ? "text-gold" : score >= 40 ? "text-ember" : "text-ember-deep";

  return (
    <div className="realm-bg min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Brand header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <RavenMark className="h-7 w-7 text-gold" />
            <span className="font-display text-sm font-semibold uppercase tracking-[0.22em] text-bone">
              The Ravenspire
            </span>
          </Link>
          <span className="rounded-full border border-gold/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">
            The Watch
          </span>
        </div>

        <h1 className="mt-6 font-display text-2xl font-semibold text-bone">
          Token safety report
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-bone-mut">
          <span className="tnum">{short}</span>
          <span className="text-bone-faint">·</span>
          <span>{chainLabel}</span>
        </p>

        {!report ? (
          <div className="glass mt-6 p-8 text-center text-sm text-bone-mut">
            <Icon name="search" className="mx-auto mb-3 h-6 w-6 text-bone-faint" />
            The Watch could not read a verdict for this contract yet — it may be
            too new to have been analysed, or the wall was unreachable.
            <Link
              href={`/watch?address=${address}&chain=${chain}`}
              className="mt-4 block text-gold underline"
            >
              Try a live scan in The Watch
            </Link>
          </div>
        ) : (
          <>
            <div className="glass mt-6 p-6 text-center">
              <p
                className={`tnum font-display text-5xl font-semibold ${scoreColor}`}
              >
                {score}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
                Defenses score
              </p>
              <p
                className={`mt-3 font-display text-lg font-semibold ${verdictStyle[report.verdict]}`}
              >
                {report.headline}
              </p>
            </div>

            {GROUPS.map((g) => {
              const rows = report.checks.filter((c) => c.group === g.id);
              if (rows.length === 0) return null;
              return (
                <div key={g.id} className="glass mt-3 p-2">
                  <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                    {g.label}
                  </p>
                  <div className="flex flex-col divide-y divide-steel-line">
                    {rows.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-3">
                        <Icon
                          name={statusIcon[c.status]}
                          className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${statusColor[c.status]}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${statusColor[c.status]}`}>
                            {c.label}
                          </p>
                          {c.detail && (
                            <p className="mt-0.5 text-xs text-bone-faint">
                              {c.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="glass glass-sm mt-3 flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-bone-mut">
                Trade taxes
                {report.raw.taxSource === "simulation" && (
                  <span className="ml-1 text-[11px] text-gold">simulated</span>
                )}
              </span>
              <span className="tnum text-bone">
                Buy {report.raw.buyTax.toFixed(1)}% / Sell{" "}
                {report.raw.sellTax.toFixed(1)}%
              </span>
            </div>

            {report.explorer && (
              <a
                href={report.explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glass mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Icon name="arrow" className="h-4 w-4" />
                Verify on the block explorer
              </a>
            )}
          </>
        )}

        {/* Calls to enter the realm */}
        <div className="glass mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-base font-semibold text-bone">
              Read any token before you trade it
            </p>
            <p className="mt-0.5 text-sm text-bone-mut">
              The Watch reads live on-chain defenses — free, non-custodial.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/watch?address=${address}&chain=${chain}`}
              className="btn-glass px-4 py-2 text-sm"
            >
              Open The Watch
            </Link>
            <Link href="/" className="btn-gold px-4 py-2 text-sm">
              Enter the realm
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-bone-faint">
          Safety data via GoPlus &amp; honeypot.is, read live and cached briefly.
          The Ravenspire never holds your keys.
        </p>
      </div>
    </div>
  );
}
