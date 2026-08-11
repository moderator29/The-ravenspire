"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  Chip,
  ChipRail,
  ConsoleHeader,
  ConsolePage,
  ConsoleToolbar,
  CONSOLE_BODY,
  CONSOLE_META,
  CONSOLE_PAD,
} from "@/components/console/console-shell";
import { TokenLogo } from "@/components/wallet/token-logo";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { shareOrCopy } from "@/lib/share";
import { realmFetch } from "@/lib/auth/api";
import type {
  WatchCheck,
  WatchVerdict,
  CheckGroup,
} from "@/lib/tools/watch-types";

/* The Watch: a Console. Compact above md, the address field and chain filter
   live on a toolbar rail rather than scattered through the panels, and the
   check groups read as dense rows rather than as cards with air. */

const CHAINS = [
  { id: "1", label: "Ethereum" },
  { id: "8453", label: "Base" },
  { id: "42161", label: "Arbitrum" },
  { id: "10", label: "Optimism" },
  { id: "56", label: "BNB" },
] as const;

const GROUPS: { id: CheckGroup; label: string }[] = [
  { id: "contract", label: "Contract" },
  { id: "trading", label: "Trading" },
  { id: "holders", label: "Holders and liquidity" },
];

interface WatchResult {
  score?: number;
  verdict?: WatchVerdict;
  headline?: string;
  checks?: WatchCheck[];
  raw?: {
    buyTax: number;
    sellTax: number;
    taxSource: "simulation" | "static";
    ownerPercent: number | null;
    creatorPercent: number | null;
    holderCount: number | null;
    lpLockedPercent: number | null;
  };
  explorer?: string | null;
  error?: string;
  status?: string;
}

interface Approval {
  token: string;
  tokenSymbol: string | null;
  tokenLogo: string | null;
  spender: string;
  spenderLabel: string | null;
  allowance: string | null;
  valueAtRiskUsd: number | null;
  risky: boolean;
}

interface ApprovalsResult {
  configured: boolean;
  approvals: Approval[];
  error?: string;
}

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

const verdictStyle: Record<WatchVerdict, string> = {
  safe: "text-gold",
  caution: "text-ember",
  danger: "text-ember-deep",
  unknown: "text-bone-faint",
};

const MAX_UINT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function shortHex(value: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function allowanceLabel(allowance: string) {
  if (!allowance) return "Unknown allowance";
  if (allowance === MAX_UINT || allowance.toLowerCase() === "unlimited") {
    return "Unlimited";
  }
  return `Capped: ${allowance}`;
}

export default function WatchPage() {
  const { authenticated, address } = useRealmAuth();

  const [contract, setContract] = useState("");
  const [chain, setChain] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WatchResult | null>(null);

  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalsResult | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  /* The address a verdict was actually read for, captured at scan time so the
     shareable report link stays correct even if the input is edited after. */
  const [scanned, setScanned] = useState<{ address: string; chain: string } | null>(
    null
  );
  const [shared, setShared] = useState(false);

  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const sender = useMemo(() => {
    const embedded = wallets.find(
      (w) =>
        w.walletClientType === "privy" ||
        w.walletClientType === "privy-v2" ||
        w.connectorType === "embedded"
    );
    return embedded ?? wallets[0] ?? null;
  }, [wallets]);

  const valid = /^0x[a-fA-F0-9]{40}$/.test(contract.trim());

  const scanAddress = useCallback(async (addr: string, chainId: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) return;
    setLoading(true);
    setResult(null);
    setShared(false);
    try {
      const res = await fetch(
        `/api/watch?address=${encodeURIComponent(addr.trim())}&chain=${chainId}`
      );
      const body = (await res.json()) as WatchResult;
      setResult(body);
      if (!body.error) setScanned({ address: addr.trim(), chain: chainId });
    } catch {
      setResult({ error: "The Watch could not reach the wall" });
    } finally {
      setLoading(false);
    }
  }, []);

  /* Copy a public, shareable link to this token's safety report (a page that
     opens for anyone, member or not, with a rich preview card). */
  const shareReport = useCallback(() => {
    if (!scanned) return;
    const url = `${window.location.origin}/safety/${scanned.chain}/${scanned.address}`;
    void shareOrCopy(url, "Token safety report · The Watch").then(() => {
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    });
  }, [scanned]);

  const scan = () => void scanAddress(contract, chain);

  /* Deep link: /watch?address=0x..&chain=8453 (from the WatchBadge) runs a
     scan on arrival so the badge and the tool stay one surface. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addr = params.get("address");
    const c = params.get("chain");
    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setContract(addr);
      if (c && CHAINS.some((ch) => ch.id === c)) setChain(c);
      void scanAddress(addr, c && CHAINS.some((ch) => ch.id === c) ? c : "1");
    }
  }, [scanAddress]);

  const loadApprovals = useCallback(async () => {
    if (!authenticated || !address) return;
    setApprovalsLoading(true);
    setRevokeError(null);
    try {
      const res = await realmFetch<ApprovalsResult>(
        `/api/approvals?address=${encodeURIComponent(address)}&chain=${chain}`
      );
      setApprovals(
        res.data ?? {
          configured: true,
          approvals: [],
          error: "The Watch could not reach the ledger",
        }
      );
    } catch {
      setApprovals({
        configured: true,
        approvals: [],
        error: "The Watch could not reach the ledger",
      });
    } finally {
      setApprovalsLoading(false);
    }
  }, [authenticated, address, chain]);

  useEffect(() => {
    if (authenticated && address) void loadApprovals();
    else setApprovals(null);
  }, [authenticated, address, loadApprovals]);

  /* One-tap revoke: a real, non-custodial approve(spender, 0) signed by the
     member's own wallet on the selected chain. On success the row drops out. */
  const revoke = useCallback(
    async (a: Approval) => {
      if (!sender?.address) {
        setRevokeError("No wallet is ready to sign the revoke.");
        return;
      }
      const rowKey = `${a.token}-${a.spender}`;
      setRevoking(rowKey);
      setRevokeError(null);
      try {
        try {
          await sender.switchChain?.(Number(chain));
        } catch {
          /* provider may switch inside its own window */
        }
        await sendTransaction(
          {
            to: a.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [a.spender as `0x${string}`, 0n],
            }),
            value: 0n,
            chainId: Number(chain),
          },
          { address: sender.address }
        );
        setApprovals((prev) =>
          prev
            ? {
                ...prev,
                approvals: prev.approvals.filter(
                  (x) => !(x.token === a.token && x.spender === a.spender)
                ),
              }
            : prev
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setRevokeError(
          /reject|denied|cancel/i.test(msg)
            ? "You closed the wallet window. The approval still stands."
            : "The revoke could not be sent. Try again."
        );
      } finally {
        setRevoking(null);
      }
    },
    [sender, chain, sendTransaction]
  );

  const score = result?.score ?? 0;
  const scoreColor =
    score >= 70 ? "text-gold" : score >= 40 ? "text-ember" : "text-ember-deep";

  const showScanSkeleton = useDelayedLoading(loading, 300);
  const showApprovalsSkeleton = useDelayedLoading(
    approvalsLoading && !approvals,
    300
  );
  const chainLabel = CHAINS.find((c) => c.id === chain)?.label;

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Watch"
        kicker="Token security scanner"
        badge={<Badge icon="shield">Live chain reads</Badge>}
      />

      {/* The scan rail: address, chain, action. One row on desktop, a Sheet
          on a phone rather than three wrapped rows of controls. */}
      <div className="mt-4 flex flex-col gap-2 md:mt-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="watch-address"
            aria-label="Token contract address"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void scan();
            }}
            placeholder="Token contract address, 0x..."
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-md border border-steel-line bg-obsidian/60 px-3 font-mono text-sm text-bone placeholder:font-sans placeholder:text-bone-faint transition-colors duration-fast focus:border-gold/60 md:h-9 md:text-[13px]"
          />
          <Button
            variant="gold"
            size="lg"
            className="shrink-0 md:h-9 md:text-sm"
            disabled={!valid || loading}
            loading={loading}
            onClick={() => void scan()}
          >
            {loading ? "Scanning" : "Scan"}
          </Button>
        </div>

        <ConsoleToolbar label="Chain" summary={chainLabel}>
          <ChipRail label="Chain">
            {CHAINS.map((c) => (
              <Chip
                key={c.id}
                active={chain === c.id}
                onClick={() => setChain(c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </ChipRail>
        </ConsoleToolbar>

        {contract.trim() !== "" && !valid && (
          <p className={cx("text-bone-faint", CONSOLE_META)}>
            The Watch reads EVM contract addresses: 0x followed by 40 hex
            characters.
          </p>
        )}
      </div>

      {loading && showScanSkeleton && (
        <Card pad="none" className={cx("mt-3 md:mt-2", CONSOLE_PAD)}>
          <div className="flex flex-col items-center gap-2 py-2">
            <Skeleton radius="md" className="h-10 w-20" />
            <Skeleton radius="sm" className="h-2.5 w-32" />
          </div>
        </Card>
      )}

      {result?.error && (
        <Card pad="none" className="mt-3 md:mt-2">
          <EmptyState
            size="sm"
            icon="alert"
            title="No reading"
            body={result.error}
          />
        </Card>
      )}

      {result && !result.error && (
        <div className="mt-3 flex flex-col gap-3 md:mt-2 md:gap-2">
          <Card pad="none" className={cx("text-center", CONSOLE_PAD)}>
            <p className={cx("tnum font-display text-4xl font-semibold md:text-3xl", scoreColor)}>
              {score}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.26em] text-bone-faint">
              Defenses score
            </p>
            {result.verdict && (
              <p
                className={cx(
                  "mt-2 font-display text-base font-semibold",
                  verdictStyle[result.verdict]
                )}
              >
                {result.headline}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {scanned && (
                <Button size="sm" onClick={shareReport}>
                  <Icon name="share" className="h-3.5 w-3.5" />
                  {shared ? "Link copied" : "Share report"}
                </Button>
              )}
              {result.explorer && (
                <Button
                  size="sm"
                  render={
                    <a
                      href={result.explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="arrow" className="h-3.5 w-3.5" />
                      Verify on the explorer
                    </a>
                  }
                />
              )}
            </div>
          </Card>

          {GROUPS.map((g) => {
            const rows = (result.checks ?? []).filter((c) => c.group === g.id);
            if (rows.length === 0) return null;
            return (
              <Card key={g.id} pad="none" className="px-1 py-1">
                <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                  {g.label}
                </p>
                <div className="flex flex-col divide-y divide-steel-line">
                  {rows.map((c, i) => (
                    <div
                      key={i}
                      className="flex min-h-11 items-start gap-2.5 px-3 py-2.5 md:min-h-9 md:py-2"
                    >
                      <Icon
                        name={statusIcon[c.status]}
                        aria-hidden
                        className={cx(
                          "mt-0.5 h-5 w-5 shrink-0 md:h-[17px] md:w-[17px]",
                          statusColor[c.status]
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cx(CONSOLE_BODY, statusColor[c.status])}>
                          {c.label}
                        </p>
                        {c.detail && (
                          <p
                            className={cx(
                              "mt-0.5 text-bone-faint",
                              CONSOLE_META
                            )}
                          >
                            {c.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}

          {result.raw && (
            <Card
              pad="none"
              className={cx(
                "flex items-center justify-between gap-3",
                CONSOLE_BODY,
                CONSOLE_PAD
              )}
            >
              <span className="text-bone-mut">
                Trade taxes
                {result.raw.taxSource === "simulation" && (
                  <span className="ml-1 text-[11px] text-gold">simulated</span>
                )}
              </span>
              <span className="tnum text-right text-bone">
                Buy {result.raw.buyTax.toFixed(1)}% / Sell{" "}
                {result.raw.sellTax.toFixed(1)}%
              </span>
            </Card>
          )}
        </div>
      )}

      <section className="mt-6 md:mt-4">
        <SectionHeader title="Your open approvals" hint="Spenders you granted" />

        {authenticated && address && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              disabled={approvalsLoading}
              loading={approvalsLoading}
              onClick={() => void loadApprovals()}
            >
              {approvalsLoading ? "Reading" : "Refresh"}
            </Button>
          </div>
        )}

        {!authenticated || !address ? (
          <Card pad="none" className="mt-2">
            <EmptyState
              size="sm"
              icon="lock"
              title="Not signed in"
              body="Enter the realm with a connected wallet to audit the approvals you have signed."
            />
          </Card>
        ) : approvalsLoading && !approvals ? (
          showApprovalsSkeleton ? (
            <Card pad="none" className="mt-2 px-1 py-1">
              <ApprovalSkeleton />
            </Card>
          ) : null
        ) : approvals && approvals.configured === false ? (
          <Card pad="none" className="mt-2">
            <EmptyState
              size="sm"
              icon="eye"
              title="Lens not mounted"
              body="Live approval reads need the GoldRush lens, which is not configured in this environment yet."
            />
          </Card>
        ) : approvals && approvals.error ? (
          <Card pad="none" className="mt-2">
            <EmptyState size="sm" icon="alert" title="No reading" body={approvals.error} />
          </Card>
        ) : approvals && approvals.approvals.length === 0 ? (
          <Card pad="none" className="mt-2">
            <EmptyState
              size="sm"
              icon="shield"
              title="Nothing to revoke"
              body="No open approvals were found for this address."
            />
          </Card>
        ) : approvals ? (
          <>
            {revokeError && (
              <p className={cx("mt-2 text-ember", CONSOLE_META)}>{revokeError}</p>
            )}
            {/* Five fields per approval, so this is a card list on a phone and
                a dense row above md. It never scrolls sideways. */}
            <Card pad="none" className="mt-2 flex flex-col divide-y divide-steel-line px-1 py-1">
              {approvals.approvals.map((a, i) => {
                const rowKey = `${a.token}-${a.spender}`;
                const busy = revoking === rowKey;
                return (
                  <div
                    key={`${rowKey}-${i}`}
                    className="flex min-h-11 items-center gap-3 px-2 py-2.5 md:py-2"
                  >
                    <TokenLogo
                      logo={a.tokenLogo}
                      symbol={a.tokenSymbol ?? "?"}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={cx(
                            "truncate font-semibold text-bone",
                            CONSOLE_BODY
                          )}
                        >
                          {a.tokenSymbol ?? shortHex(a.token)}
                        </p>
                        {a.risky && <Badge variant="danger">Risk</Badge>}
                      </div>
                      <p
                        className={cx("mt-0.5 truncate text-bone-faint", CONSOLE_META)}
                      >
                        {a.spenderLabel ?? `Spender ${shortHex(a.spender)}`}
                      </p>
                      <p className={cx("mt-0.5 text-ember", CONSOLE_META)}>
                        {allowanceLabel(a.allowance ?? "")}
                        {a.valueAtRiskUsd && a.valueAtRiskUsd > 0.01 ? (
                          <span className="tnum ml-1.5 text-bone-faint">
                            ~$
                            {a.valueAtRiskUsd.toLocaleString("en-US", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            at risk
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      className="shrink-0"
                      disabled={busy}
                      loading={busy}
                      onClick={() => void revoke(a)}
                    >
                      {busy ? "Revoking" : "Revoke"}
                    </Button>
                  </div>
                );
              })}
            </Card>

            <Note>
              Revoking is non-custodial: it never moves your keys. Each revoke is
              a wallet signature that sets the spender allowance to zero, signed
              in your own wallet. You pay only network gas.
            </Note>
          </>
        ) : null}
      </section>

      <Note>
        The Watch reads public defenses and approvals from live chain data. It
        never holds your keys or moves your assets.
      </Note>
    </ConsolePage>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Card
      pad="none"
      className={cx(
        "mt-3 flex items-start gap-2.5 text-bone-mut md:mt-2",
        CONSOLE_BODY,
        CONSOLE_PAD
      )}
    >
      <Icon
        name="shield"
        aria-hidden
        className="mt-0.5 h-5 w-5 shrink-0 text-gold md:h-[17px] md:w-[17px]"
      />
      <p>{children}</p>
    </Card>
  );
}

/* Shaped like the approval rows it replaces, not a grey slab. */
function ApprovalSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-steel-line">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-11 items-center gap-3 px-2 py-2.5">
          <Skeleton radius="full" className="h-7 w-7 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton radius="sm" className="h-2.5 w-20" />
            <Skeleton radius="sm" className="h-2 w-40" />
          </div>
          <Skeleton radius="md" className="h-8 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
