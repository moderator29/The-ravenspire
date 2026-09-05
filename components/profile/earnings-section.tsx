"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { shareOrCopy } from "@/lib/share";
import { sharePath } from "@/lib/share/links";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { EarningsChart, type EarningsPoint } from "@/components/profile/earnings-chart";
import { PositionsList } from "@/components/profile/positions-list";
import type { PositionToken } from "@/app/api/profile/earnings/types";

/* THE COFFERS
   The public panel: a member's earned POINTS and their wallet holdings, kept
   in one obsidian-and-gold surface. POINTS are standing in the realm and are
   never $RSP, never an amount of money, and never described as convertible
   into either. The full statement, reconciled against the balance and carrying
   the on chain receipts, is the Console at /coffers. Everything is real,
   drawn through /api/profile/earnings (points_ledger) and
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
  /* Proven tributes, counted. Never a POINTS figure: see the Fact that renders
     it, and the header of app/api/profile/earnings/route.ts. */
  tributeCount: number;
  referralRewards: number;
  totalGlory: number;
  /* Balance movements, reported beside the earnings rather than folded in. */
  staked: number;
  stakeNet: number;
  givenToHouse: number;
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
const BALANCE_POLL_MS = 30_000;

/* Stable empty reference so the wallet hook does not re-fetch every render;
   The Coffers folds in no custom tokens of its own. */
const EMPTY_CUSTOM: [] = [];

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

  /* The viewer's own embedded Privy wallet, read live through the same balances
     route + hook the Vault and Ledger use. This is the member's REAL platform
     wallet, already connected realm-wide, so The Coffers shows its true total
     with no "connect a wallet" gimmick and no invented reserve. Only ever the
     viewer's own address is read here, and it is only surfaced when they own
     this Keep. */
  const { address } = useRealmAuth();
  const wallet = useWalletTokens(address, EMPTY_CUSTOM);

  /* Keep the balance live: re-read the chain totals on a gentle cadence so the
     FOMO figure tracks the real wallet in near real time. */
  const refreshWallet = wallet.refresh;
  useEffect(() => {
    if (!address) return;
    const t = setInterval(() => refreshWallet(), BALANCE_POLL_MS);
    return () => clearInterval(t);
  }, [address, refreshWallet]);

  const load = useCallback(async () => {
    const res = await realmFetch<EarningsResponse>(
      `/api/profile/earnings?id=${encodeURIComponent(profileId)}`
    );
    if (res.ok && res.data) {
      setData(res.data);
      /* Only seed the editable thesis from the server on the first fetch, so a
         background refresh never clobbers what the owner is typing. */
      /* `res.data.public` is optional-chained rather than assumed. The live
         route always sends it, so this is hardening rather than a live bug,
         but a 200 without that block would throw inside an effect and take the
         whole Keep down with it. A missing thesis is an empty field; it is not
         a reason for the screen to disappear. */
      if (firstLoad.current) setThesis(res.data.public?.thesis ?? "");
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

  /* Live holdings + wallet balance. The route enforces the gate on the token
     LIST (owners and public-positions members only), but the aggregate wallet
     total is public on-chain data and comes back for every Keep with a linked
     wallet. So we fetch for every profile, even one that seals its PnL, so
     The Coffers can always show a real balance instead of a reputation stand-in. */
  useEffect(() => {
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
  }, [profileId]);

  const share = () => {
    /* Through sharePath rather than string interpolation, which is what this
       was. A member with no handle yet produced `/u/` and the control happily
       said "Copied", so the one member most likely to be shown this button
       (a new one, on their own Coffers) got a link to nothing. A null path is
       now a control that does nothing rather than one that lies. */
    const path = sharePath({ kind: "keep", handle: handle ?? "" });
    if (!path) return;
    void shareOrCopy(
      `${window.location.origin}${path}`,
      "The Coffers on The Ravenspire"
    ).then((result) => {
      if (result !== "shared" && result !== "copied") return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
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
    return <Skeleton className="mt-3 h-56 w-full" radius="xl" />;
  }
  if (!data) return null;

  const pub = data.public;
  const owner = data.isOwner;

  /* The public wallet balance total (on-chain, so it is shown for every Keep
     that has linked a wallet). Null when no wallet is linked or the balance
     service is unavailable, in that case The Coffers falls back to standing. */
  const publicBalanceUsd: number | null =
    typeof positions?.totalUsd === "number" ? positions.totalUsd : null;
  const hasPublicBalance = publicBalanceUsd !== null;

  /* Other viewer, PnL kept private: earnings stay sealed, but the wallet
     balance is public on-chain data, so we still surface it up top. */
  if (!data.visible) {
    return (
      <Card variant="warm" pad="sm" render={<section />} className="mt-3 overflow-hidden">
        <CoffersBanner
          owner={false}
          handle={pub.handle}
          onShare={share}
          copied={copied}
        />

        {hasPublicBalance && (
          <div className="mt-2.5">
            <Coffer icon="wallet" label="Wallet balance" live>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold tnum leading-none text-bone">
                  {fmtUsd(publicBalanceUsd)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-bone-faint">
                Live on-chain balance across tracked realms
              </p>
            </Coffer>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-steel-line/70 bg-void/40 px-3 py-2.5 text-bone-mut">
          <Icon name="lock" className="h-4 w-4 shrink-0 text-gold" />
          <span className="text-sm">
            This Keep seals its coffers. Earnings are kept private.
          </span>
        </div>
        <div className="tnum mt-2.5 grid grid-cols-3 gap-2">
          <Stat label="Renown" value={fmt.format(pub.renown)} icon="medal" />
          <Stat label="Calls won" value={fmt.format(pub.callsWon)} icon="target" />
          <Stat label="Crests" value={fmt.format(pub.crestCount)} icon="crown" />
        </div>
        {pub.thesis && (
          <p className="mt-2.5 flex items-center gap-2 border-t border-steel-line pt-2.5 text-sm italic text-bone-mut">
            <Icon name="scroll" className="h-3.5 w-3.5 shrink-0 text-gold" />
            &ldquo;{pub.thesis}&rdquo;
          </p>
        )}
      </Card>
    );
  }

  const earn = data.earnings;
  const win = earn?.windows?.[tf];
  const hasEarnings = !!earn && earn.grandTotal > 0;

  /* Holdings + balance source. The owner reads their live embedded-wallet
     balance straight from the balances hook (real, real-time); other viewers
     see only what the member chose to make public via the positions route,
     never a balance total. */
  const walletTokens: PositionToken[] = owner
    ? wallet.tokens.map((t) => ({
        key: t.key,
        symbol: t.symbol,
        name: t.name,
        logo: t.logo,
        chainShort: t.chainShort,
        amount: t.balanceDisplay,
        valueUsd: t.quoteUsd,
        change24h: t.change24h,
        native: t.isNative,
      }))
    : (positions?.tokens ?? []);
  const tokens = walletTokens;
  const hasTokens = tokens.length > 0;

  /* Owner: real total from the live wallet. The number is honest even at zero
     (an empty wallet reads $0.00), so there is no fabricated reserve. */
  const balanceLoading = owner && wallet.loading && wallet.tokens.length === 0;
  const ownerBalanceUsd = wallet.totalUsd;
  const balanceLive = owner && !!address && wallet.configured;
  /* Holdings total: the owner's live wallet total, or a public member's shared
     positions total. Null when there is nothing real to show. */
  const holdingsTotalUsd: number | null = owner
    ? ownerBalanceUsd
    : publicBalanceUsd;

  const changePct = win?.changePct ?? 0;
  const windowDelta = win?.delta ?? 0;

  const PREVIEW = 4;

  return (
    <Card variant="warm" pad="sm" render={<section />} className="mt-3 overflow-hidden">
      <CoffersBanner
        owner={owner}
        handle={pub.handle}
        onShare={share}
        copied={copied}
      />

      {/* The headline coffer: earned points read as the one clear figure on
          this panel, with the wallet balance (or public standing) folded in
          beneath as a compact companion line rather than a second,
          equal-weight box competing for the same glance. */}
      <EarningsHeadline
        total={earn?.grandTotal ?? 0}
        hasEarnings={hasEarnings}
        windowDelta={windowDelta}
        changePct={changePct}
        since={TF_SINCE[tf]}
        companion={
          owner ? (
            <CofferCompanion
              icon="wallet"
              label="Wallet balance"
              live={balanceLive}
              value={
                !address
                  ? "Resting"
                  : balanceLoading
                    ? "..."
                    : fmtUsd(ownerBalanceUsd)
              }
              meta={
                !address
                  ? "Your embedded Vault wakes with the Gatehouse."
                  : balanceLoading
                    ? "Reading your Vault..."
                    : balanceLive
                      ? `${tokens.length} ${tokens.length === 1 ? "asset" : "assets"} across chains, live`
                      : "Live balances are resting in this realm."
              }
            />
          ) : hasPublicBalance ? (
            <CofferCompanion
              icon="wallet"
              label="Wallet balance"
              live
              value={fmtUsd(publicBalanceUsd)}
              meta={`${fmt.format(pub.renown)} Renown · ${fmt.format(pub.callsWon)} calls won`}
            />
          ) : (
            <CofferCompanion
              icon="medal"
              label="Standing"
              value={
                <>
                  {fmt.format(pub.renown)}{" "}
                  <span className="text-xs font-normal text-gold">Renown</span>
                </>
              }
              meta={`${fmt.format(pub.glory)} Glory · ${fmt.format(pub.callsWon)} calls won`}
            />
          )
        }
      />

      {/* Timeframe toggle + windowed climb */}
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          The climb
        </span>
        {/* A capsule rail of rectangular tabs, which is the exact shape the
            realm does not use. SegmentedControl is the right primitive here
            anyway: the timeframes are few and mutually exclusive, and the
            hand rolled version had no arrow key handling and no roving
            tabindex despite carrying tablist and tab roles. */}
        <SegmentedControl
          label="Earnings timeframe"
          size="sm"
          value={tf}
          onValueChange={(next) => setTf(next as (typeof TIMEFRAMES)[number])}
          items={TIMEFRAMES.map((f) => ({ value: f, label: f }))}
        />
      </div>

      <div className="mt-2">
        <EarningsChart
          series={win?.series ?? []}
          emptyLabel={
            hasEarnings
              ? `No points moved in the last ${TF_SINCE[tf]}. Try a wider window.`
              : "Not enough history yet to chart. Earn on to watch it climb."
          }
        />
      </div>

      {/* Holdings roll */}
      {(hasTokens || (owner && positions !== null)) && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
              Holdings
            </span>
            {holdingsTotalUsd !== null && (
              <span className="tnum text-xs text-bone-mut">
                {fmtUsd(holdingsTotalUsd)}
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
          <div className="mt-2.5 border-t border-steel-line pt-2.5">
            <label className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Your thesis
            </label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value.slice(0, 140))}
              rows={2}
              maxLength={140}
              placeholder="One line the realm should know you by."
              className="mt-1.5 w-full resize-none rounded-lg border border-steel-line bg-void px-3 py-2 text-sm text-bone outline-none focus:border-gold/40"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-bone-faint">
                {thesis.length}/140
              </span>
              <div className="flex gap-2">
                <Button
                  variant="glass"
                  size="sm"
                  className="text-bone-mut"
                  onClick={() => {
                    setThesis(pub.thesis ?? "");
                    setThesisEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  loading={thesisSaving}
                  onClick={() => void saveThesis()}
                >
                  {thesisSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            /* `touch:min-h-11`, because this row is a control and its height
               was an accident of its padding: `pt-3` over one line of
               `text-sm` measured 300x33 on a phone, populated and empty
               alike. Eleven pixels under the floor, produced by nobody
               choosing a height at all, which is how most of the misses in
               this product were made.

               `type="button"` for the same reason it belongs on every hand
               rolled button: the default is `submit`, and this one sits
               inside a card that will eventually hold a form. */
            onClick={() => setThesisEditing(true)}
            className="mt-2.5 flex w-full touch:min-h-11 items-center gap-2 border-t border-steel-line pt-3 text-left text-sm text-bone-mut transition hover:text-bone"
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
        <p className="mt-2.5 flex items-center gap-2 border-t border-steel-line pt-2.5 text-sm italic text-bone-mut">
          <Icon name="scroll" className="h-3.5 w-3.5 shrink-0 text-gold" />
          &ldquo;{pub.thesis}&rdquo;
        </p>
      ) : null}

      {/* View more */}
      <Button
        variant="glass"
        size="sm"
        block
        aria-expanded={expanded}
        className="mt-2.5 text-bone-mut"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide breakdown" : "View more"}
        <Icon
          name="arrow"
          className={`h-3.5 w-3.5 transition-transform duration-fast ${expanded ? "-rotate-90" : "rotate-90"}`}
        />
      </Button>

      {expanded && (
        <div className="mt-2.5 flex flex-col gap-3 border-t border-steel-line pt-3">
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
                Where the points came from
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
            {/* A COUNT, NOT A POINTS FIGURE. This read `tipsTotal` in POINTS,
                summed from `tips.points`, a column that has been null on every
                row since tributes became on chain transfers: it was a
                structural zero on every profile in the realm. A tribute arrives
                in a token, not in POINTS, so the honest thing a profile panel
                can say is how many have been proven. The amounts, in their own
                units, are on The Coffers. */}
            <Fact
              label="Tributes received"
              value={fmt.format(earn?.tributeCount ?? 0)}
            />
          </div>
        </div>
      )}
    </Card>
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
      {/* `min-w-0` here, not only on the text block inside it.

          A flex item will not shrink below its content unless every ancestor
          between it and the flex container says it may. The `truncate` two
          levels down was doing nothing, because this row could not shrink to
          let it: the header measured 379px of content inside a 300px box at
          390px wide, so the Share button sat outside the card.

          This is the same missing link every time: `min-w-0` belongs on the
          flex child, and the chain has to be unbroken. */}
      <div className="flex min-w-0 items-center gap-3">
        {/* 36px at `--radius-lg`, down from 40px at `--radius-2xl`. A radius is
            a capsule the moment it reaches half the box height, and 26px on a
            40px square is well past that: the panel's identity tile was
            rendering as a circle, which rule 9 reserves for avatars and
            genuinely circular icon buttons. 16px on a 36px square is a rounded
            rectangle and stays one. */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
          <Icon name="wallet" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="gold-text font-display text-base font-bold leading-none">
              The Coffers
            </h3>
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-bright" />
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-bone-faint">
            {owner
              ? "Your earned points and live holdings"
              : `${handle ? `${handle}'s` : "This Keep's"} treasury, kept in the open`}
          </p>
        </div>
      </div>

      <Button
        variant="glass"
        size="sm"
        className="shrink-0 text-bone-mut"
        onClick={onShare}
      >
        <Icon name="share" className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Share"}
      </Button>
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
    /* `--radius-lg` is the inner card rung and this is an inner card. It was
       drawn at `--radius-xl`, the signature card rung, so a coffer inside The
       Coffers had the same corner as the panel holding it and the nesting read
       as one soft blob rather than a box inside a box. 10px of padding, down
       from 12: a coffer holds a number and a line of meta, and the outer Card
       already carries the panel's own gutter. */
    <div
      className={`rounded-lg border p-2.5 ${
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
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* The headline coffer: earned points as the one clear figure on the panel.
   `companion` tucks the wallet balance (owner), public balance, or standing
   in beneath as a single subordinate line, never a second equal-weight box:
   the "twin coffers" grid this replaces put a member's own POINTS beside a
   dollar figure at the same size and weight, so the eye had nowhere to land
   first. A member reads this treasury; they do not compare two of them. */
function EarningsHeadline({
  total,
  hasEarnings,
  windowDelta,
  changePct,
  since,
  companion,
}: {
  total: number;
  hasEarnings: boolean;
  windowDelta: number;
  changePct: number;
  since: string;
  companion: React.ReactNode;
}) {
  const up = windowDelta >= 0;
  return (
    <div className="mt-2.5 rounded-lg border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-3">
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name="coin" className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
          Points earned
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="gold-text font-display text-3xl font-bold tnum leading-none">
          {fmt.format(total)}
        </span>
        <span className="text-xs font-semibold text-gold">points</span>
      </div>
      {hasEarnings ? (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`tnum inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-semibold ${
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
            {signed(windowDelta)} in {since}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-bone-faint">
          No points earned yet. Send ravens, seal calls, win glory.
        </p>
      )}
      {/* The conversion is committed and is said plainly. The rate is not,
          and is not implied: rule 7 shows POINTS for an earned balance and
          never an amount of $RSP, which stays true whether or not a
          conversion exists. See components/economy/coffers-console.tsx for
          the longer form of the same sentence. */}
      <p className="mt-1 text-[11px] text-bone-faint">
        POINTS convert to $RSP at TGE. No rate is set yet
      </p>

      {companion}
    </div>
  );
}

/* The compact companion: a wallet balance or public standing tucked beneath
   the headline points figure as one subordinate line, `label`, a live dot,
   and a right aligned value, with an optional caption underneath. This is
   the "compact companion" the twin coffers grid lacked: same information,
   a third the footprint, and no competition with the headline above it. */
function CofferCompanion({
  icon,
  label,
  value,
  meta,
  live,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div className="mt-2.5 border-t border-gold/15 pt-2.5">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} className="h-3.5 w-3.5 shrink-0 text-bone-faint" />
        <span className="text-xs text-bone-mut">{label}</span>
        {live && (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-bright" />
          </span>
        )}
        <span className="tnum ml-auto text-sm font-semibold text-bone">
          {value}
        </span>
      </div>
      {meta && (
        <p className="tnum mt-1 pl-5 text-[11px] text-bone-faint">{meta}</p>
      )}
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
    <div className="rounded-lg border border-steel-line/70 bg-void/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="tnum mt-1 text-base font-semibold text-bone">{value}</p>
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
