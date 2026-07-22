"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { EarningsChart, type EarningsPoint } from "@/components/profile/earnings-chart";
import { PositionsList } from "@/components/profile/positions-list";
import type { PositionToken } from "@/app/api/profile/earnings/types";

/* THE COFFERS
   The realm's treasury panel: a member's platform $RSP earnings and their
   wallet holdings, kept in one obsidian-and-gold surface. Everything is real,
   drawn through /api/profile/earnings (points_ledger + tips) and
   /api/profile/earnings/positions (live on-chain balances), both privacy-gated
   server-side. Timeframes (24h / 7d / 30d) window the same real event stream;
   sparse accounts get honest empty states, never invented numbers.

   Naming sits with the realm's lexicon (The Ledger, The Vault, Renown, Glory,
   Whispers). The layout is our own: a treasury banner, twin earnings/balance
   coffers, a windowed climb, and a holdings roll. Not a generic earnings clone. */

type Timeframe = "24h" | "7d" | "30d";
const TIMEFRAMES: Timeframe[] = ["24h", "7d", "30d"];
const TF_SINCE: Record<Timeframe, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

interface WindowBlock {
  series: EarningsPoint[];
  delta: number;
  changePct: number;
  events: number;
}

interface PublicBlock {
  handle: string | null;
  joinDate: string;
  renown: number;
  glory: number;
  tier: string;
  callsWon: number;
  callsLost: number;
  callsOpen: number;
  crestCount: number;
  referralCount: number;
  thesis: string | null;
}

interface EarningsBlock {
  grandTotal: number;
  ledgerPoints: number;
  tipsTotal: number;
  referralRewards: number;
  totalGlory: number;
  series: EarningsPoint[];
  windows: Record<Timeframe, WindowBlock>;
  breakdown: { label: string; value: number }[];
  firstEarnedAt: string | null;
  lastEarnedAt: string | null;
}

interface EarningsResponse {
  visible: boolean;
  isOwner: boolean;
  showPositions: boolean;
  public: PublicBlock;
  earnings?: EarningsBlock;
  walletAddress?: string | null;
}

interface PositionsResponse {
  canView: boolean;
  isOwner: boolean;
  configured?: boolean;
  tokens: PositionToken[];
  totalUsd?: number;
}

const EARNINGS_POLL_MS = 30_000;
const POSITIONS_POLL_MS = 45_000;

const fmt = new Intl.NumberFormat("en-US");

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${fmt.format(Math.round(n))}`;
}

function joinLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function EarningsSection({
  profileId,
  handle,
}: {
  profileId: string;
  handle: string | null;
  /* Accepted so callers can pass their optimistic own-Keep hint; ownership is
     authoritatively resolved server-side from the caller's token. */
  own?: boolean;
}) {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tf, setTf] = useState<Timeframe>("7d");

  const [positions, setPositions] = useState<PositionsResponse | null>(null);

  const [thesis, setThesis] = useState("");
  const [thesisEditing, setThesisEditing] = useState(false);
  const [thesisSaving, setThesisSaving] = useState(false);

  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    const res = await realmFetch<EarningsResponse>(
      `/api/profile/earnings?id=${encodeURIComponent(profileId)}`
    );
    if (res.ok && res.data) {
      setData(res.data);
      /* Only seed the editable thesis from the server on the first fetch, so a
         background refresh never clobbers what the owner is typing. */
      if (firstLoad.current) setThesis(res.data.public.thesis ?? "");
    }
    firstLoad.current = false;
    setLoading(false);
  }, [profileId]);

  /* Live earnings: initial load plus a gentle re-fetch so the treasury feels
     current without hammering the API. */
  useEffect(() => {
    firstLoad.current = true;
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), EARNINGS_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  /* Live holdings + owner balance. The route enforces the gate: owners get a
     balance total and full holdings, public-positions members expose their
     token list only, everyone else gets canView:false. */
  useEffect(() => {
    if (!data?.visible) {
      setPositions(null);
      return;
    }
    let alive = true;
    const pull = async () => {
      const res = await realmFetch<PositionsResponse>(
        `/api/profile/earnings/positions?id=${encodeURIComponent(profileId)}`
      );
      if (alive && res.ok && res.data) setPositions(res.data);
    };
    void pull();
    const t = setInterval(() => void pull(), POSITIONS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [profileId, data?.visible]);

  const share = () => {
    const url = `${window.location.origin}/u/${handle ?? ""}`;
    void navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const saveThesis = async () => {
    setThesisSaving(true);
    const next = thesis.trim().slice(0, 140);
    const res = await realmFetch("/api/settings", {
      method: "POST",
      json: { profile: { thesis: next } },
    });
    setThesisSaving(false);
    if (res.ok) {
      setThesisEditing(false);
      setData((d) =>
        d ? { ...d, public: { ...d.public, thesis: next || null } } : d
      );
    }
  };

  if (loading) {
    return <div className="glass glass-warm mt-4 h-56 animate-pulse" />;
  }
  if (!data) return null;

  const pub = data.public;
  const owner = data.isOwner;

  /* Other viewer, PnL kept private: reputation only, never a balance. */
  if (!data.visible) {
    return (
      <section className="glass glass-warm mt-4 overflow-hidden p-5">
        <CoffersBanner
          owner={false}
          handle={pub.handle}
          onShare={share}
          copied={copied}
        />
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-steel-line/70 bg-void/40 px-4 py-3 text-bone-mut">
          <Icon name="lock" className="h-4 w-4 shrink-0 text-gold" />
          <span className="text-sm">
            This Keep seals its coffers. Earnings are kept private.
          </span>
        </div>
        <div className="tnum mt-4 grid grid-cols-3 gap-3">
          <Stat label="Renown" value={fmt.format(pub.renown)} icon="medal" />
          <Stat label="Calls won" value={fmt.format(pub.callsWon)} icon="target" />
          <Stat label="Crests" value={fmt.format(pub.crestCount)} icon="crown" />
        </div>
        {pub.thesis && (
          <p className="mt-4 flex items-center gap-2 border-t border-steel-line pt-3 text-sm italic text-bone-mut">
            <Icon name="scroll" className="h-3.5 w-3.5 shrink-0 text-gold" />
            &ldquo;{pub.thesis}&rdquo;
          </p>
        )}
      </section>
    );
  }

  const earn = data.earnings;
  const win = earn?.windows?.[tf];
  const hasEarnings = !!earn && earn.grandTotal > 0;

  const tokens = positions?.tokens ?? [];
  const hasTokens = tokens.length > 0;
  const balanceConfigured =
    !!positions?.configured && typeof positions.totalUsd === "number";

  const changePct = win?.changePct ?? 0;
  const windowDelta = win?.delta ?? 0;
  const up = windowDelta >= 0;

  const PREVIEW = 4;

  return (
    <section className="glass glass-warm mt-4 overflow-hidden p-5">
      <CoffersBanner
        owner={owner}
        handle={pub.handle}
        onShare={share}
        copied={copied}
      />

      {/* Twin coffers: platform earnings beside the wallet balance (owner) or
          public standing (other members). */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Coffer accent icon="coin" label="Platform earnings">
          <div className="flex items-baseline gap-1.5">
            <span className="gold-text font-display text-4xl font-bold tnum leading-none">
              {fmt.format(earn?.grandTotal ?? 0)}
            </span>
            <span className="text-sm font-semibold text-gold">$RSP</span>
          </div>
          {hasEarnings ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`tnum inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  windowDelta === 0
                    ? "border-steel-line/70 text-bone-faint"
                    : up
                      ? "border-gold/30 bg-gold/5 text-gold"
                      : "border-ember/30 bg-ember/5 text-ember"
                }`}
              >
                {windowDelta !== 0 && (
                  <Icon
                    name="arrow"
                    className={`h-3 w-3 ${up ? "-rotate-90" : "rotate-90"}`}
                  />
                )}
                {changePct === 0
                  ? "flat"
                  : `${up ? "+" : ""}${changePct.toFixed(changePct <= -10 || changePct >= 10 ? 0 : 1)}%`}
              </span>
              <span className="tnum text-xs text-bone-faint">
                {signed(windowDelta)} $RSP in {TF_SINCE[tf]}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-bone-faint">
              No $RSP earned yet. Send ravens, seal calls, win glory.
            </p>
          )}
          {hasEarnings && earn?.firstEarnedAt && (
            <p className="mt-1 text-[11px] text-bone-faint">
              Earning since {joinLabel(earn.firstEarnedAt)}
            </p>
          )}
        </Coffer>

        {owner ? (
          <Coffer icon="wallet" label="Wallet balance" live>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold tnum leading-none text-bone">
                {positions === null
                  ? "..."
                  : balanceConfigured
                    ? fmtUsd(positions.totalUsd as number)
                    : fmt.format(pub.renown)}
              </span>
              {positions !== null && !balanceConfigured && (
                <span className="text-sm font-semibold text-gold">Renown</span>
              )}
            </div>
            <p className="mt-2 text-xs text-bone-faint">
              {positions === null
                ? "Reading holdings..."
                : balanceConfigured
                  ? `${tokens.length} ${tokens.length === 1 ? "asset" : "assets"} across chains`
                  : "Link a wallet to track live balance. Showing renown reserve."}
            </p>
          </Coffer>
        ) : (
          <Coffer icon="medal" label="Standing">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold tnum leading-none text-bone">
                {fmt.format(pub.renown)}
              </span>
              <span className="text-sm font-semibold text-gold">Renown</span>
            </div>
            <p className="tnum mt-2 text-xs text-bone-faint">
              {fmt.format(pub.glory)} Glory &middot; {fmt.format(pub.callsWon)} calls won
            </p>
          </Coffer>
        )}
      </div>

      {/* Timeframe toggle + windowed climb */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          The climb
        </span>
        <div
          role="tablist"
          aria-label="Earnings timeframe"
          className="flex items-center gap-0.5 rounded-full border border-steel-line/70 bg-void/50 p-0.5"
        >
          {TIMEFRAMES.map((f) => {
            const active = f === tf;
            return (
              <button
                key={f}
                role="tab"
                aria-selected={active}
                onClick={() => setTf(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-gold/15 text-gold"
                    : "text-bone-faint hover:text-bone-mut"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2">
        <EarningsChart
          series={win?.series ?? []}
          emptyLabel={
            hasEarnings
              ? `No $RSP moved in the last ${TF_SINCE[tf]}. Try a wider window.`
              : "Not enough history yet to chart. Earn on to watch it climb."
          }
        />
      </div>

      {/* Holdings roll */}
      {(hasTokens || (owner && positions !== null)) && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Holdings
            </span>
            {owner && balanceConfigured && (
              <span className="tnum text-xs text-bone-mut">
                {fmtUsd(positions?.totalUsd as number)}
              </span>
            )}
          </div>
          {hasTokens ? (
            <div className="mt-1">
              <PositionsList tokens={tokens} max={PREVIEW} />
              {tokens.length > PREVIEW && !expanded && (
                <p className="mt-2 text-center text-[11px] text-bone-faint">
                  +{tokens.length - PREVIEW} more in the full breakdown
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-bone-faint">
              No tokens held yet. Fund your wallet to fill the coffers.
            </p>
          )}
        </div>
      )}

      {/* Shareable thesis */}
      {owner ? (
        thesisEditing ? (
          <div className="mt-4 border-t border-steel-line pt-3">
            <label className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Your thesis
            </label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value.slice(0, 140))}
              rows={2}
              maxLength={140}
              placeholder="One line the realm should know you by."
              className="mt-1.5 w-full resize-none rounded-xl border border-steel-line bg-void px-3 py-2 text-sm text-bone outline-none focus:border-gold/40"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-bone-faint">
                {thesis.length}/140
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setThesis(pub.thesis ?? "");
                    setThesisEditing(false);
                  }}
                  className="btn-glass px-3 py-1 text-xs text-bone-mut"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveThesis()}
                  disabled={thesisSaving}
                  className="btn-gold px-3 py-1 text-xs"
                >
                  {thesisSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setThesisEditing(true)}
            className="mt-4 flex w-full items-center gap-2 border-t border-steel-line pt-3 text-left text-sm text-bone-mut transition hover:text-bone"
          >
            <Icon name="scroll" className="h-3.5 w-3.5 shrink-0 text-gold" />
            {pub.thesis ? (
              <span className="italic">&ldquo;{pub.thesis}&rdquo;</span>
            ) : (
              <span className="text-bone-faint">Set a thesis line</span>
            )}
          </button>
        )
      ) : pub.thesis ? (
        <p className="mt-4 flex items-center gap-2 border-t border-steel-line pt-3 text-sm italic text-bone-mut">
          <Icon name="scroll" className="h-3.5 w-3.5 shrink-0 text-gold" />
          &ldquo;{pub.thesis}&rdquo;
        </p>
      ) : null}

      {/* View more */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-steel-line/70 py-2 text-xs font-semibold text-bone-mut transition hover:border-gold/30 hover:text-bone"
      >
        {expanded ? "Hide breakdown" : "View more"}
        <Icon
          name="arrow"
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-4 border-t border-steel-line pt-4">
          {/* Remaining holdings beyond the preview */}
          {tokens.length > PREVIEW && (
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                All holdings
              </h4>
              <div className="mt-1">
                <PositionsList tokens={tokens} max={12} />
              </div>
            </div>
          )}

          {/* Allocation of earnings by source */}
          {data.showPositions && earn && earn.breakdown.length > 0 ? (
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Where the $RSP came from
              </h4>
              <div className="mt-2 flex flex-col gap-2">
                {earn.breakdown.map((slice) => {
                  const pct = earn.grandTotal
                    ? Math.round((slice.value / earn.grandTotal) * 100)
                    : 0;
                  return (
                    <div key={slice.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-bone-mut">{slice.label}</span>
                        <span className="tnum text-bone">
                          {fmt.format(slice.value)}{" "}
                          <span className="text-bone-faint">{pct}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-void">
                        <div
                          className="gold-metal h-full rounded-full"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !data.showPositions ? (
            <p className="text-xs text-bone-faint">
              This member keeps their earning sources private.
            </p>
          ) : (
            <p className="text-xs text-bone-faint">
              No earning sources to break down yet.
            </p>
          )}

          {/* Portfolio facts */}
          <div className="tnum grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <Fact label="Joined" value={joinLabel(pub.joinDate)} />
            <Fact label="Renown" value={fmt.format(pub.renown)} />
            <Fact label="Glory" value={fmt.format(pub.glory)} />
            <Fact label="Calls won" value={fmt.format(pub.callsWon)} />
            <Fact label="Calls lost" value={fmt.format(pub.callsLost)} />
            <Fact label="Calls open" value={fmt.format(pub.callsOpen)} />
            <Fact label="Crests" value={fmt.format(pub.crestCount)} />
            <Fact label="Referrals" value={fmt.format(pub.referralCount)} />
            <Fact
              label="Tips earned"
              value={`${fmt.format(earn?.tipsTotal ?? 0)} $RSP`}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* Treasury banner: the realm-themed identity of the panel. */
function CoffersBanner({
  owner,
  handle,
  onShare,
  copied,
}: {
  owner: boolean;
  handle: string | null;
  onShare: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gold/30 bg-gold/5 text-gold">
          <Icon name="wallet" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="gold-text font-display text-lg font-bold leading-none">
              The Coffers
            </h3>
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-bright" />
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-bone-faint">
            {owner
              ? "Your $RSP treasury and live holdings"
              : `${handle ? `${handle}'s` : "This Keep's"} treasury, kept in the open`}
          </p>
        </div>
      </div>

      <button
        onClick={onShare}
        className="btn-glass flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs text-bone-mut"
      >
        <Icon name="share" className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Share"}
      </button>
    </div>
  );
}

/* One coffer: a labelled treasury card. `accent` warms the border in gold for
   the headline earnings; `live` flags a real-time value with a pulse dot. */
function Coffer({
  icon,
  label,
  accent,
  live,
  children,
}: {
  icon: string;
  label: string;
  accent?: boolean;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent"
          : "border-steel-line/70 bg-void/40"
      }`}
    >
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
        {live && (
          <span className="relative ml-auto flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-bright" />
          </span>
        )}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-steel-line/70 bg-void/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="tnum mt-1 text-lg font-semibold text-bone">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <span className="mt-0.5 text-bone">{value}</span>
    </div>
  );
}
