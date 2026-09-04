"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/tabs";
import { CopyButton } from "@/components/wallet/copy-button";
import { AddressQR } from "@/components/wallet/address-qr";
import {
  addressExplorerUrlFor,
  txExplorerUrlFor,
} from "@/components/wallet/chains";
import { SEASON_ZERO, formatEth } from "@/lib/season-zero";
import {
  registerContribution,
  type SeasonZeroContribution,
} from "@/components/season-zero/api";

/* Contribute from any wallet: the treasury address with QR and copy, a chain
 * selector, and the hash registration form.
 *
 * The member sends ETH to the treasury from whatever wallet they hold, then
 * pastes the transaction hash here. The server reads the chain: the sender,
 * the value and whether the treasury was paid all come from the receipt,
 * never from this form. While that read runs the state says so ("Verifying on
 * chain"), and nothing is shown as recorded until the server answers that it
 * is (rule 17). */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

type Verify =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "recorded"; contribution: SeasonZeroContribution; already: boolean }
  | { kind: "unsettled"; message: string }
  | { kind: "refused"; message: string };

export function SeasonZeroRegisterTx({
  onRecorded,
  chains,
  registerOnly = false,
}: {
  onRecorded: () => void;
  /* The chains the server can verify right now, already filtered by the
     caller. Never the full declared list: an address offered on a chain whose
     receipts the realm cannot read is an invitation it cannot honor. */
  chains: { id: number; name: string; primary: boolean }[];
  /* Hash registration without the deposit invitation. Used once the hardcap
     is reached: a transfer already sent is still attributed by its hash, but
     the page no longer shows an address asking for more. */
  registerOnly?: boolean;
}) {
  const [chainId, setChainId] = useState<number>(
    () => chains.find((c) => c.primary)?.id ?? chains[0]?.id ?? 8453
  );
  const [hash, setHash] = useState("");
  const [state, setState] = useState<Verify>({ kind: "idle" });

  const trimmed = hash.trim();
  const hashValid = TX_HASH_RE.test(trimmed);
  const verifying = state.kind === "verifying";

  const submit = async () => {
    if (!hashValid || verifying) return;
    setState({ kind: "verifying" });
    const outcome = await registerContribution(trimmed, chainId);
    if (outcome.kind === "recorded") {
      setState({
        kind: "recorded",
        contribution: outcome.contribution,
        already: outcome.alreadyRecorded,
      });
      onRecorded();
    } else if (outcome.kind === "unsettled") {
      setState({ kind: "unsettled", message: outcome.message });
    } else {
      setState({ kind: "refused", message: outcome.message });
    }
  };

  const chainName = chains.find((c) => c.id === chainId)?.name ?? "Base";
  const addressExplorer = addressExplorerUrlFor(chainId, SEASON_ZERO.treasury);

  if (state.kind === "recorded") {
    const explorer = txExplorerUrlFor(
      state.contribution.chainId,
      state.contribution.txHash
    );
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-gold/25 bg-panel-warm/60 p-4 text-center">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-panel"
          >
            <Icon name="check" className="h-5 w-5 text-gold" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              {state.already
                ? "Already recorded"
                : "Contribution confirmed on chain"}
            </p>
            <p className="mt-1 text-sm text-bone-mut">
              {formatEth(BigInt(state.contribution.amountWei))} ETH verified.
              Your allocation of{" "}
              <span className="tnum font-medium text-bone">
                {Number(state.contribution.rsp).toLocaleString("en-US")} $RSP
              </span>{" "}
              is recorded.
            </p>
          </div>
          {explorer ? (
            <Button
              size="sm"
              render={
                <a href={explorer} target="_blank" rel="noreferrer">
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                  View on explorer
                </a>
              }
            />
          ) : null}
        </div>
        <Button
          block
          onClick={() => {
            setHash("");
            setState({ kind: "idle" });
          }}
        >
          Register another
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-bone-mut">
        {registerOnly
          ? "Already sent a transfer? Choose its chain and paste the transaction hash to register it. A transaction can only ever count once."
          : "Send ETH to the treasury from any wallet you control, on the chain you choose below, then paste the transaction hash to register your contribution. Do not send from an exchange: refunds and attribution need a wallet whose keys are yours."}
      </p>

      {/* A choice needs two options. With one verifiable chain the treasury
          card below already names it, so a single-item control would be a
          control that decides nothing. */}
      {chains.length > 1 ? (
        <SegmentedControl
          label="Contribution chain"
          items={chains.map((c) => ({
            value: String(c.id),
            label: c.primary ? `${c.name} (recommended)` : c.name,
          }))}
          value={String(chainId)}
          onValueChange={(v) => setChainId(Number(v))}
          block
          size="sm"
        />
      ) : null}

      {registerOnly ? null : (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-steel-line bg-panel/40 p-4 sm:flex-row sm:items-start">
        <AddressQR value={SEASON_ZERO.treasury} className="h-36 w-36 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Season Zero treasury on {chainName}
          </p>
          <code className="tnum block break-all font-mono text-[13px] leading-relaxed text-bone">
            {SEASON_ZERO.treasury}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={SEASON_ZERO.treasury} label="Copy address" variant="gold" />
            {addressExplorer ? (
              <Button
                size="sm"
                render={
                  <a href={addressExplorer} target="_blank" rel="noreferrer">
                    <Icon name="arrow" className="h-3.5 w-3.5" />
                    Explorer
                  </a>
                }
              />
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-bone-faint">
            ETH on {chainName} only, {SEASON_ZERO.minContributionEth} ETH
            minimum. The same address holds on both chains.
          </p>
        </div>
      </div>
      )}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label
          className="text-[11px] uppercase tracking-[0.2em] text-bone-faint"
          htmlFor="sz-tx-hash"
        >
          Transaction hash
        </label>
        <input
          id="sz-tx-hash"
          value={hash}
          onChange={(e) => {
            setHash(e.target.value);
            if (state.kind !== "idle" && state.kind !== "verifying") {
              setState({ kind: "idle" });
            }
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste your transaction hash to register your contribution"
          disabled={verifying}
          className={`tnum h-11 w-full rounded-md border bg-panel/60 px-3 font-mono text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold disabled:opacity-60 ${
            trimmed === "" || hashValid ? "border-steel-line" : "border-ember/60"
          }`}
        />
        {trimmed !== "" && !hashValid ? (
          <span className="text-xs text-ember">
            A transaction hash is 0x followed by 64 hex characters.
          </span>
        ) : null}

        <Button
          type="submit"
          variant="gold"
          size="lg"
          block
          className="mt-1.5"
          disabled={!hashValid || verifying}
          loading={verifying}
        >
          {verifying ? "Verifying on chain..." : "Register contribution"}
        </Button>
      </form>

      {state.kind === "unsettled" ? (
        <div className="rounded-lg border border-steel-line bg-panel/50 p-3">
          <p className="text-sm font-medium text-bone">Not confirmed yet</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            {state.message} Leave this page open or come back later and
            register the same hash again; it can only ever count once.
          </p>
          <Button size="sm" className="mt-2" onClick={() => void submit()}>
            Check again
          </Button>
        </div>
      ) : null}

      {state.kind === "refused" ? (
        <div className="rounded-lg border border-ember/40 bg-panel/50 p-3">
          <p className="text-sm font-medium text-ember">Not registered</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            {state.message}
          </p>
        </div>
      ) : null}
    </div>
  );
}
