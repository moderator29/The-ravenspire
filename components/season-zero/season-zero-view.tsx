"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { Icon } from "@/components/ui/icon";
import { Button, INLINE_TOUCH_TARGET } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  evmChainById,
  shortAddress,
  txExplorerUrlFor,
  addressExplorerUrlFor,
} from "@/components/wallet/chains";
import { SEASON_ZERO, seasonZeroPhase, formatEth, rspForWei } from "@/lib/season-zero";
import type { SeasonZeroPhase } from "@/lib/season-zero";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { useSeasonZero, type SeasonZeroState } from "@/components/season-zero/api";
import { SeasonZeroVaultSend } from "@/components/season-zero/vault-send";
import { SeasonZeroRegisterTx } from "@/components/season-zero/register-tx";

/* The Season Zero page body. One of the few earned Forge moments in the
 * realm, spent with restraint: the hero above this component carries the
 * ceremony, and everything below it is Ledger, dense and honest. Every
 * number on this surface is either a shared constant or a figure the server
 * summed from chain-verified rows; nothing here is typed in. */

const TERMS_KEY = "rvn_sz_terms_v1";

export function SeasonZeroView() {
  const { state, loading, error, refresh } = useSeasonZero();
  const showSkeleton = useDelayedLoading(loading);

  /* The clock, ticked twice a minute so the countdown and the phase flip
     without a reload. Date-dependent rendering starts only after the fetch
     resolves, which is client-side by construction, so the server render
     (a skeleton) never disagrees with the first client render. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (showSkeleton) return <ViewSkeleton />;
  if (loading) return null;

  if (!state || error) {
    return (
      <Card>
        <EmptyState
          icon="alert"
          title="The round could not be read"
          body="The raise total and your position are real figures read from the server, so nothing is shown until they load."
          action={<Button onClick={refresh}>Try again</Button>}
        />
      </Card>
    );
  }

  const phase = seasonZeroPhase(new Date(now));
  const raisedWei = safeBigInt(state.raisedWei);

  return (
    <div className="flex flex-col gap-4">
      <PhaseBand phase={phase} now={now} />
      <RaiseCard state={state} raisedWei={raisedWei} phase={phase} />
      <Calculator />
      <ContributeCard
        phase={phase}
        hardcapReached={raisedWei >= parseEther(String(state.hardcapEth))}
        onRecorded={refresh}
      />
      <YourPosition state={state} />
      <ScopeAndSteps />
      <Faq />
      <SecurityNote />
      <footer className="px-1 pb-2 text-xs leading-relaxed text-bone-faint">
        Season Zero is offered under the realm&apos;s{" "}
        <Link
          href="/legal/terms"
          className={`${INLINE_TOUCH_TARGET} font-medium text-bone-mut underline underline-offset-2 hover:text-bone`}
        >
          terms
        </Link>{" "}
        and{" "}
        <Link
          href="/legal/privacy"
          className={`${INLINE_TOUCH_TARGET} font-medium text-bone-mut underline underline-offset-2 hover:text-bone`}
        >
          privacy notice
        </Link>
        . Crypto assets are volatile; contribute only what you can afford to
        hold. Not available where prohibited by law.
      </footer>
    </div>
  );
}

/* ----- The phase band: countdown, live window, or the closed record ----- */

function PhaseBand({ phase, now }: { phase: SeasonZeroPhase; now: number }) {
  if (phase === "upcoming") {
    const remaining = countdown(Date.parse(SEASON_ZERO.startsAt) - now);
    return (
      <Card variant="warm" tone="gold" pad="md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Opens September 1, 00:00 UTC
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              Everything below is readable now. Contributions open with the
              window.
            </p>
          </div>
          <CountdownTiles parts={remaining} />
        </div>
      </Card>
    );
  }

  if (phase === "live") {
    const remaining = countdown(Date.parse(SEASON_ZERO.endsAt) - now);
    return (
      <Card variant="warm" tone="gold" pad="md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-bright">
              The round is live
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              Closes September 20, 23:59 UTC, or early at the hardcap.
            </p>
          </div>
          <CountdownTiles parts={remaining} label="left" />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="warm" pad="md">
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        The round has closed
      </p>
      <p className="mt-1 text-sm text-bone-mut">
        The final figures stand below. If the softcap was met, allocations are
        delivered at the token generation event; if not, every contribution is
        returned to its sending wallet.
      </p>
    </Card>
  );
}

function CountdownTiles({
  parts,
  label,
}: {
  parts: { d: number; h: number; m: number };
  label?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="timer"
      aria-label={`${parts.d} days ${parts.h} hours ${parts.m} minutes ${label ?? "until opening"}`}
    >
      {(
        [
          [parts.d, "days"],
          [parts.h, "hrs"],
          [parts.m, "min"],
        ] as const
      ).map(([value, unit]) => (
        <span
          key={unit}
          className="flex min-w-13 flex-col items-center rounded-md border border-gold/25 bg-panel/60 px-2 py-1.5"
        >
          <span className="tnum font-display text-lg font-semibold leading-none text-bone">
            {value}
          </span>
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
            {unit}
          </span>
        </span>
      ))}
      {label ? (
        <span className="ml-1 text-xs text-bone-faint">{label}</span>
      ) : null}
    </div>
  );
}

/* ----- The raise: one gold bar against two caps, and the figures ----- */

function RaiseCard({
  state,
  raisedWei,
  phase,
}: {
  state: SeasonZeroState;
  raisedWei: bigint;
  phase: SeasonZeroPhase;
}) {
  const raisedEth = Number(raisedWei) / 1e18;
  const pct = Math.min(100, (raisedEth / state.hardcapEth) * 100);
  const softPct = (state.softcapEth / state.hardcapEth) * 100;
  const softcapMet = raisedEth >= state.softcapEth;

  return (
    <Card pad="lg">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-bone">
          {phase === "ended" ? "The final raise" : "The raise"}
        </h2>
        {phase === "ended" ? (
          <span
            className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              softcapMet
                ? "border-gold/40 text-gold-bright"
                : "border-ember/40 text-ember"
            }`}
          >
            {softcapMet ? "Softcap met" : "Softcap missed, refunds due"}
          </span>
        ) : phase === "live" && softcapMet ? (
          /* Said the moment it becomes true, not only in the post-mortem:
             once the softcap is met the round stands and every backer's
             refund question is answered. */
          <span className="rounded-sm border border-gold/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-bright">
            Softcap met, the round stands
          </span>
        ) : null}
      </div>

      <div className="relative mt-4" aria-hidden>
        <div className="bar-track h-2.5 w-full">
          <div
            className="bar-gold h-full"
            style={{ width: `${raisedEth > 0 ? Math.max(pct, 1.5) : 0}%` }}
          />
        </div>
        {/* Softcap and hardcap markers. Plain ticks; the labels carry them. */}
        <span
          className="absolute -top-1 h-4.5 w-px bg-bone/50"
          style={{ left: `${softPct}%` }}
        />
        <span className="absolute -top-1 right-0 h-4.5 w-px bg-bone/50" />
      </div>
      <div className="relative mt-1 h-4 text-[10px] uppercase tracking-[0.14em] text-bone-faint">
        <span
          className="absolute -translate-x-1/2"
          style={{ left: `${softPct}%` }}
        >
          Softcap {state.softcapEth} ETH
        </span>
        <span className="absolute right-0">Hardcap {state.hardcapEth} ETH</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          label="Raised"
          value={`${formatEthFixed(raisedWei)} ETH`}
          hint={raisedEth > 0 ? `${pct.toFixed(1)}% of hardcap` : undefined}
          live={phase === "live"}
        />
        <StatTile
          label="Backers"
          value={state.backerCount.toLocaleString("en-US")}
        />
        <StatTile
          label="$RSP per ETH"
          value={state.rspPerEth.toLocaleString("en-US")}
        />
        <StatTile
          label="Allocation"
          value={`${state.rspAllocation.toLocaleString("en-US")}`}
          hint={`${state.supplyPct}% of supply`}
        />
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-bone-faint">
        The raised figure is a sum over contributions verified on chain by the
        server; anyone can check it independently against the treasury address
        below. If the round closes under the {state.softcapEth} ETH softcap,
        every contribution is returned to its sending wallet.
      </p>
    </Card>
  );
}

function StatTile({
  label,
  value,
  hint,
  live,
}: {
  label: string;
  value: string;
  hint?: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-md border border-steel-line bg-panel/40 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
        {live ? (
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
        ) : null}
      </dt>
      <dd className="tnum mt-1 truncate font-display text-base font-semibold text-bone">
        {value}
      </dd>
      {hint ? (
        <dd className="tnum mt-0.5 text-[11px] text-bone-faint">{hint}</dd>
      ) : null}
    </div>
  );
}

/* ----- The allocation calculator ----- */

function Calculator() {
  const [amount, setAmount] = useState("");

  const parsed = useMemo(() => {
    const v = amount.trim();
    if (v === "") return null;
    try {
      const wei = parseEther(v);
      return wei > 0n ? wei : null;
    } catch {
      return null;
    }
  }, [amount]);

  const minWei = parseEther(String(SEASON_ZERO.minContributionEth));
  const underMin = parsed !== null && parsed < minWei;
  const allocation =
    parsed !== null && !underMin ? rspForWei(parsed) : null;

  return (
    <Card pad="md">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          htmlFor="sz-calc"
          className="text-sm font-medium text-bone sm:w-40 sm:shrink-0"
        >
          Your allocation
        </label>
        <div className="relative flex-1">
          <input
            id="sz-calc"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            placeholder={String(SEASON_ZERO.minContributionEth)}
            className={`tnum h-11 w-full rounded-md border bg-panel/60 px-3 pr-12 font-mono text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold ${
              underMin ? "border-ember/60" : "border-steel-line"
            }`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium uppercase tracking-[0.12em] text-bone-faint">
            ETH
          </span>
        </div>
        <p
          className="tnum text-sm text-bone-mut sm:w-56 sm:shrink-0 sm:text-right"
          aria-live="polite"
        >
          {allocation !== null ? (
            <>
              <span className="font-semibold text-bone">
                {allocation.toLocaleString("en-US")}
              </span>{" "}
              $RSP
            </>
          ) : underMin ? (
            <span className="text-ember">
              Minimum {SEASON_ZERO.minContributionEth} ETH
            </span>
          ) : (
            <span className="text-bone-faint">
              Fixed at {SEASON_ZERO.rspPerEth.toLocaleString("en-US")} per ETH
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}

/* ----- The terms gate and the two contribution methods ----- */

function ContributeCard({
  phase,
  hardcapReached,
  onRecorded,
}: {
  phase: SeasonZeroPhase;
  /* The page promises the round can close early at the hardcap, so the page
     is where that promise is kept: once the verified raise reaches it, the
     invitation to contribute is withdrawn. The API keeps recording, on
     purpose: a transfer already sent is a fact on chain, and refusing to
     register it would orphan real money rather than refuse it. */
  hardcapReached: boolean;
  onRecorded: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [method, setMethod] = useState("vault");
  /* The Privy hooks inside the Vault method need their provider, and the
     contribute route needs a signed-in member; both are read here so the card
     can say so instead of failing. */
  const { enabled, authenticated, signInX, signInEmail } = useRealmAuth();

  useEffect(() => {
    try {
      if (localStorage.getItem(TERMS_KEY) === "1") setAccepted(true);
    } catch {
      /* storage unavailable; the box simply starts unchecked */
    }
  }, []);

  const accept = (next: boolean) => {
    setAccepted(next);
    try {
      if (next) localStorage.setItem(TERMS_KEY, "1");
      else localStorage.removeItem(TERMS_KEY);
    } catch {
      /* storage unavailable; acceptance still holds for this visit */
    }
  };

  if (phase === "ended") return null;

  return (
    <Card pad="lg">
      <h2 className="font-display text-base font-semibold text-bone">
        Contribute
      </h2>

      {/* The terms, in plain language, always visible. */}
      <ul className="mt-3 flex flex-col gap-1.5 text-[13px] leading-relaxed text-bone-mut">
        <TermLine>
          Season Zero is a founding contribution round: ETH sent to the realm
          treasury buys a fixed allocation of $RSP at{" "}
          {SEASON_ZERO.rspPerEth.toLocaleString("en-US")} per ETH.
        </TermLine>
        <TermLine>
          If the round closes below the {SEASON_ZERO.softcapEth} ETH softcap,
          every contribution is returned to its sending wallet.
        </TermLine>
        <TermLine>
          Tokens are delivered at the token generation event, not immediately.
        </TermLine>
        <TermLine>
          Crypto assets carry real risk of loss. Contribute only what you can
          afford to hold, and only where the law allows you to take part.
        </TermLine>
      </ul>

      <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-md border border-steel-line bg-panel/40 px-3 py-2.5 touch:min-h-11">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => accept(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--gold)]"
        />
        <span className="text-[13px] font-medium text-bone">
          I have read and accept the Season Zero terms and risks
        </span>
      </label>

      {phase === "upcoming" ? (
        <div className="mt-3 rounded-md border border-dashed border-steel-line px-3 py-4 text-center">
          <p className="text-sm font-medium text-bone">Opens September 1</p>
          <p className="mt-1 text-xs text-bone-faint">
            The deposit address and send controls appear here when the window
            opens.
          </p>
        </div>
      ) : hardcapReached ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="rounded-md border border-gold/30 bg-panel-warm/40 px-3 py-4 text-center">
            <p className="text-sm font-medium text-bone">
              The hardcap is reached
            </p>
            <p className="mt-1 text-xs text-bone-faint">
              Season Zero has raised its full {SEASON_ZERO.hardcapEth} ETH and
              no longer invites contributions. A transfer already sent can
              still be registered below by its transaction hash.
            </p>
          </div>
          {authenticated ? (
            <SeasonZeroRegisterTx registerOnly onRecorded={onRecorded} />
          ) : null}
        </div>
      ) : !accepted ? (
        <p className="mt-3 text-xs text-bone-faint">
          The deposit address and send controls unlock once the terms are
          accepted.
        </p>
      ) : !authenticated ? (
        <div className="mt-3 rounded-md border border-dashed border-steel-line px-3 py-4 text-center">
          <p className="text-sm font-medium text-bone">
            Sign in to contribute
          </p>
          <p className="mt-1 text-xs text-bone-faint">
            A contribution is recorded against your account, so the realm
            knows whose allocation it is.
          </p>
          {enabled ? (
            <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button variant="gold" onClick={signInX}>
                <Icon name="xlogo" className="h-4 w-4" />
                Enter with X
              </Button>
              <Button onClick={signInEmail}>
                <Icon name="mail" className="h-4 w-4" />
                Enter with email
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <SegmentedControl
            label="Contribution method"
            items={[
              { value: "vault", label: "From your Vault" },
              { value: "any", label: "From any wallet" },
            ]}
            value={method}
            onValueChange={setMethod}
            block
          />
          {method === "vault" && enabled ? (
            <SeasonZeroVaultSend onRecorded={onRecorded} />
          ) : (
            <SeasonZeroRegisterTx onRecorded={onRecorded} />
          )}
        </div>
      )}
    </Card>
  );
}

function TermLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
      <span>{children}</span>
    </li>
  );
}

/* ----- Your position ----- */

function YourPosition({ state }: { state: SeasonZeroState }) {
  const yours = state.yours;

  return (
    <section aria-label="Your position">
      <SectionHeader title="Your position" />
      <Card pad={yours && yours.contributions.length ? "md" : "none"} className="mt-2">
        {yours && yours.contributions.length ? (
          <div className="flex flex-col">
            {yours.contributions.map((c) => {
              const chain = evmChainById(c.chainId);
              const explorer = txExplorerUrlFor(c.chainId, c.txHash);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 border-t border-steel-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="tnum text-sm font-medium text-bone">
                      {formatEth(safeBigInt(c.amountWei))} ETH{" "}
                      <span className="font-normal text-bone-faint">
                        on {chain?.name ?? `chain ${c.chainId}`}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-bone-faint">
                      <span>{formatDate(c.createdAt)}</span>
                      {explorer ? (
                        <a
                          href={explorer}
                          target="_blank"
                          rel="noreferrer"
                          className={`${INLINE_TOUCH_TARGET} tnum font-mono underline underline-offset-2 hover:text-bone-mut`}
                        >
                          {shortAddress(c.txHash, 8, 6)}
                        </a>
                      ) : (
                        <span className="tnum font-mono">
                          {shortAddress(c.txHash, 8, 6)}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="tnum shrink-0 text-sm text-bone-mut">
                    {Number(c.rsp).toLocaleString("en-US")} $RSP
                  </p>
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-gold/25 pt-2.5">
              <p className="text-sm font-medium text-bone">
                Total {formatEth(safeBigInt(yours.totalWei))} ETH
              </p>
              <p className="tnum text-sm font-semibold text-gold-bright">
                {Number(yours.totalRsp).toLocaleString("en-US")} $RSP
              </p>
            </div>
          </div>
        ) : (
          <EmptyState
            size="sm"
            icon="coin"
            title="No contributions yet"
            body="Verified contributions from your account appear here with their exact $RSP allocation."
          />
        )}
      </Card>
    </section>
  );
}

/* ----- What the round funds, and how to take part ----- */

function ScopeAndSteps() {
  return (
    <section aria-label="The scope of Season Zero">
      <SectionHeader title="What Season Zero funds" />
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <Card pad="md">
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-bone-mut">
            <li className="flex gap-2">
              <Icon name="flame" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              The season itself: the War, the Calls and the rewards that make
              the realm worth playing.
            </li>
            <li className="flex gap-2">
              <Icon name="crown" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              The ownership loop: $RSP staking, the Coffers and the earned
              ladder.
            </li>
            <li className="flex gap-2">
              <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              An independent audit of every surface that touches money.
            </li>
            <li className="flex gap-2">
              <Icon name="user" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              The first hires beyond the founder.
            </li>
          </ul>
        </Card>
        <Card pad="md">
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            How to participate
          </h3>
          <ol className="mt-2 flex list-none flex-col gap-1.5 text-[13px] leading-relaxed text-bone-mut">
            {[
              "Sign in to your account",
              "Accept the Season Zero terms",
              "Choose a method: your Vault, or any wallet you control",
              "Send ETH on Base or Ethereum to the treasury",
              "The server verifies the transaction on chain, automatically",
              "Your exact $RSP allocation is recorded at the fixed rate",
              "Tokens are delivered at the token generation event",
              "If the softcap is missed, your ETH returns to its sending wallet",
            ].map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="tnum mt-px flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border border-gold/30 text-[10px] font-semibold text-gold"
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </section>
  );
}

/* ----- FAQ ----- */

const FAQ: { q: string; a: string }[] = [
  {
    q: "What am I buying?",
    a: `A fixed allocation of $RSP, the realm's token, at ${SEASON_ZERO.rspPerEth.toLocaleString("en-US")} $RSP per ETH. The round draws on ${SEASON_ZERO.rspAllocation.toLocaleString("en-US")} $RSP, ${SEASON_ZERO.supplyPct} percent of the ${SEASON_ZERO.totalSupply.toLocaleString("en-US")} total supply.`,
  },
  {
    q: "When do I receive $RSP?",
    a: "At the token generation event. Until then your position on this page is the record of your exact allocation.",
  },
  {
    q: "What if the softcap is not reached?",
    a: `If the round closes below ${SEASON_ZERO.softcapEth} ETH, the round does not stand and every contribution is returned in full to the wallet that sent it.`,
  },
  {
    q: "Which chains can I use?",
    a: "Base (recommended: cheap and fast) and Ethereum mainnet. ETH only, to the same treasury address on both.",
  },
  {
    q: "Is the round custodial?",
    a: "No. Your ETH moves wallet to wallet, from yours straight to the published treasury. The platform never holds your funds or your keys at any point.",
  },
  {
    q: "Can I contribute from an exchange?",
    a: "No. Send only from a wallet whose keys you control. A refund or an attribution goes to the sending wallet, and an exchange's deposit wallet is not yours: ETH sent back to it can be lost for good.",
  },
];

function Faq() {
  return (
    <section aria-label="Frequently asked questions">
      <SectionHeader title="Questions" />
      <Card pad="md" className="mt-2">
        <dl className="flex flex-col">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="border-t border-steel-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
            >
              <dt className="text-sm font-medium text-bone">{item.q}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-bone-mut">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

/* ----- Security ----- */

function SecurityNote() {
  const baseExplorer = addressExplorerUrlFor(8453, SEASON_ZERO.treasury);
  const ethExplorer = addressExplorerUrlFor(1, SEASON_ZERO.treasury);
  return (
    <Card pad="md" tone="steel">
      <div className="flex gap-2.5">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 text-[13px] leading-relaxed text-bone-mut">
          <p className="font-medium text-bone">Verify before you send</p>
          <p className="mt-1">
            The only official address is the treasury shown on this page. We
            will never message you a different one; anyone who does is not us.
            Check the full address character by character before sending, and
            verify it yourself on{" "}
            {baseExplorer ? (
              <a
                href={baseExplorer}
                target="_blank"
                rel="noreferrer"
                className={`${INLINE_TOUCH_TARGET} font-medium underline underline-offset-2 hover:text-bone`}
              >
                Basescan
              </a>
            ) : (
              "Basescan"
            )}{" "}
            or{" "}
            {ethExplorer ? (
              <a
                href={ethExplorer}
                target="_blank"
                rel="noreferrer"
                className={`${INLINE_TOUCH_TARGET} font-medium underline underline-offset-2 hover:text-bone`}
              >
                Etherscan
              </a>
            ) : (
              "Etherscan"
            )}
            . Contributions from exchange accounts or smart-contract wallets
            are not supported: a refund can only be sent back to a wallet you
            control.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ----- Helpers ----- */

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton radius="xl" className="h-20 w-full" />
      <Skeleton radius="xl" className="h-48 w-full" />
      <Skeleton radius="xl" className="h-16 w-full" />
      <Skeleton radius="xl" className="h-56 w-full" />
    </div>
  );
}

function countdown(ms: number): { d: number; h: number; m: number } {
  const clamped = Math.max(0, ms);
  const d = Math.floor(clamped / 86_400_000);
  const h = Math.floor((clamped % 86_400_000) / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  return { d, h, m };
}

function safeBigInt(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/* Raised ETH, always with four decimals: "0.0000 ETH" is the honest empty
   figure before contributions exist, and a fixed width keeps the tile from
   breathing as the total grows. */
function formatEthFixed(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
