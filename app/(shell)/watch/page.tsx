"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { TokenLogo } from "@/components/wallet/token-logo";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { shareOrCopy } from "@/lib/share";
import type {
  WatchCheck,
  WatchVerdict,
  CheckGroup,
} from "@/lib/tools/watch-types";

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
      const res = await fetch(
        `/api/approvals?address=${encodeURIComponent(address)}&chain=${chain}`
      );
      setApprovals((await res.json()) as ApprovalsResult);
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

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="font-display text-xl font-semibold text-bone">The Watch</h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Token security scanner
      </p>

      <div className="glass mt-5 p-4 sm:p-5">
        <label
          htmlFor="watch-address"
          className="text-xs uppercase tracking-[0.2em] text-bone-faint"
        >
          Token contract address
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="watch-address"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void scan();
            }}
            placeholder="0x..."
            spellCheck={false}
            className="glass-sm min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:outline-none"
          />
          <button
            type="button"
            className="btn-gold shrink-0"
            disabled={!valid || loading}
            onClick={() => void scan()}
          >
            {loading ? "Scanning" : "Scan"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHAINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChain(c.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                chain === c.id
                  ? "border-gold bg-gold/15 text-gold-bright"
                  : "border-steel-line bg-panel/70 text-bone-mut hover:text-bone"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {contract.trim() !== "" && !valid && (
          <p className="mt-2 text-xs text-bone-faint">
            The Watch reads EVM contract addresses: 0x followed by 40 hex
            characters.
          </p>
        )}
      </div>

      {loading && <div className="glass mt-3 h-32 animate-pulse" />}

      {result?.error && (
        <div className="glass mt-3 p-6 text-center text-sm text-bone-mut">
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <>
          <div className="glass mt-3 p-6 text-center">
            <p
              className={`tnum font-display text-5xl font-semibold ${scoreColor}`}
            >
              {score}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
              Defenses score
            </p>
            {result.verdict && (
              <p
                className={`mt-3 font-display text-lg font-semibold ${verdictStyle[result.verdict]}`}
              >
                {result.headline}
              </p>
            )}
            {scanned && (
              <button
                type="button"
                onClick={shareReport}
                className="btn-glass mx-auto mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-bone-mut"
              >
                <Icon name="share" className="h-4 w-4" />
                {shared ? "Link copied" : "Share report"}
              </button>
            )}
          </div>

          {GROUPS.map((g) => {
            const rows = (result.checks ?? []).filter((c) => c.group === g.id);
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

          {result.raw && (
            <div className="glass glass-sm mt-3 flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-bone-mut">
                Trade taxes
                {result.raw.taxSource === "simulation" && (
                  <span className="ml-1 text-[11px] text-gold">simulated</span>
                )}
              </span>
              <span className="tnum text-bone">
                Buy {result.raw.buyTax.toFixed(1)}% / Sell{" "}
                {result.raw.sellTax.toFixed(1)}%
              </span>
            </div>
          )}

          {result.explorer && (
            <a
              href={result.explorer}
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

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-bone">
              Your open approvals
            </h2>
            <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
              Spenders you have granted
            </p>
          </div>
          {authenticated && address && (
            <button
              type="button"
              className="btn-glass shrink-0"
              disabled={approvalsLoading}
              onClick={() => void loadApprovals()}
            >
              {approvalsLoading ? "Reading" : "Refresh"}
            </button>
          )}
        </div>

        {!authenticated || !address ? (
          <div className="glass mt-3 p-6 text-center text-sm text-bone-mut">
            <Icon name="lock" className="mx-auto mb-3 h-6 w-6 text-bone-faint" />
            Enter the realm with a connected wallet to audit the approvals you
            have signed.
          </div>
        ) : approvalsLoading && !approvals ? (
          <div className="glass mt-3 h-32 animate-pulse" />
        ) : approvals && approvals.configured === false ? (
          <div className="glass mt-3 p-6 text-center text-sm text-bone-mut">
            Live approval reads need the GoldRush lens, which is not configured
            in this environment yet.
          </div>
        ) : approvals && approvals.error ? (
          <div className="glass mt-3 p-6 text-center text-sm text-bone-mut">
            {approvals.error}
          </div>
        ) : approvals && approvals.approvals.length === 0 ? (
          <div className="glass mt-3 p-6 text-center text-sm text-bone-mut">
            <Icon name="shield" className="mx-auto mb-3 h-6 w-6 text-gold" />
            No open approvals found for this address. Nothing to revoke.
          </div>
        ) : approvals ? (
          <>
            {revokeError && (
              <p className="mt-2 text-xs text-ember">{revokeError}</p>
            )}
            <div className="glass mt-3 flex flex-col divide-y divide-steel-line p-2">
              {approvals.approvals.map((a, i) => {
                const rowKey = `${a.token}-${a.spender}`;
                const busy = revoking === rowKey;
                return (
                  <div
                    key={`${rowKey}-${i}`}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <TokenLogo
                      logo={a.tokenLogo}
                      symbol={a.tokenSymbol ?? "?"}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-bone">
                          {a.tokenSymbol ?? shortHex(a.token)}
                        </p>
                        {a.risky && (
                          <span className="rounded-full border border-ember-deep/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ember">
                            Risk
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-bone-faint">
                        {a.spenderLabel ?? `Spender ${shortHex(a.spender)}`}
                      </p>
                      <p className="mt-0.5 text-xs text-ember">
                        {allowanceLabel(a.allowance ?? "")}
                        {a.valueAtRiskUsd && a.valueAtRiskUsd > 0.01 ? (
                          <span className="ml-1.5 text-bone-faint">
                            ~$
                            {a.valueAtRiskUsd.toLocaleString("en-US", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            at risk
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(a)}
                      className="btn-glass shrink-0 text-ember disabled:opacity-60"
                      aria-label="Revoke this approval"
                    >
                      {busy ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="glass mt-3 p-4 text-sm text-bone-mut">
              <div className="flex items-start gap-3">
                <Icon
                  name="shield"
                  className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold"
                />
                <p>
                  Revoking is non-custodial: it never moves your keys. Each
                  revoke is a wallet signature that sets the spender allowance to
                  zero, signed in your own wallet. You pay only network gas.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="glass mt-3 h-32 animate-pulse" />
        )}
      </section>

      <div className="glass mt-5 p-4 text-sm text-bone-mut">
        <div className="flex items-start gap-3">
          <Icon name="wall" className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold" />
          <p>
            The Watch reads public defenses and approvals from live chain data.
            It never holds your keys or moves your assets.
          </p>
        </div>
      </div>
    </div>
  );
}
