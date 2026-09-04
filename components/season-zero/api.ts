"use client";

import { useCallback, useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import type { SeasonZeroPhase } from "@/lib/season-zero";

/* The Season Zero client contract: the shapes the two routes answer with, one
   hook that reads the round, and one function that registers a transaction
   and walks it through verification. Kept beside the components that render
   them rather than in lib/, because nothing outside these surfaces reads
   them. */

export type SeasonZeroContribution = {
  id: string;
  chainId: number;
  txHash: string;
  walletAddress: string;
  /* Wei as a decimal string. JSON numbers are doubles and wei is not. */
  amountWei: string;
  /* Whole $RSP, as a string for the same reason. */
  rsp: string;
  createdAt: string;
};

export type SeasonZeroState = {
  phase: SeasonZeroPhase;
  raisedWei: string;
  backerCount: number;
  startsAt: string;
  endsAt: string;
  softcapEth: number;
  hardcapEth: number;
  rspPerEth: number;
  rspAllocation: number;
  supplyPct: number;
  minContributionEth: number;
  treasury: string;
  /* `verifiable` is whether the server can read a receipt on that chain right
     now. A chain that answers false is never offered: see the reasoning on
     seasonZeroChains in lib/season-zero/server.ts. */
  chains: { id: number; name: string; primary: boolean; verifiable: boolean }[];
  yours?: {
    contributions: SeasonZeroContribution[];
    totalWei: string;
    totalRsp: string;
  };
};

export function useSeasonZero() {
  const [state, setState] = useState<SeasonZeroState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<SeasonZeroState>("/api/season-zero", {
        cache: "no-store",
      });
      if (cancelled) return;
      if (res.ok && res.data) {
        setState(res.data);
        setError(null);
      } else {
        setError("The round could not be read right now.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { state, loading, error, refresh };
}

/* One registration, walked to a terminal answer.
 *
 * The route answers three ways and this polls only the middle one: a 201/200
 * is recorded (or already was), a 4xx is refused and retrying will not change
 * it, and a 202 means the chain has not settled the transaction yet, so ask
 * again in a few seconds. Rule 17: the caller shows nothing as confirmed
 * until this resolves to `recorded`. */
export type RegisterOutcome =
  | { kind: "recorded"; contribution: SeasonZeroContribution; alreadyRecorded: boolean }
  | { kind: "refused"; message: string }
  /* Still unsettled after the polling budget. Not a failure and not a
     success: the transaction may confirm later, and the caller offers a
     "check again" path. */
  | { kind: "unsettled"; message: string };

/* Base confirms in seconds and mainnet in under half a minute, so one minute
   of polling covers the honest case with room. The budget is deliberately
   short of the route's rate limit: a member who needs several settle cycles
   in one hour must never poll themselves into a 429. */
const POLL_INTERVAL_MS = 5_000;
const POLL_BUDGET_MS = 60_000;

export async function registerContribution(
  txHash: string,
  chainId: number,
  onVerifying?: () => void
): Promise<RegisterOutcome> {
  const startedAt = Date.now();

  for (;;) {
    onVerifying?.();
    const res = await realmFetch<{
      contribution?: SeasonZeroContribution;
      alreadyRecorded?: boolean;
      error?: string;
      pending?: boolean;
      retryAfter?: number;
    }>("/api/season-zero/contribute", {
      method: "POST",
      json: { txHash, chainId },
    });

    if (res.ok && res.data?.contribution) {
      return {
        kind: "recorded",
        contribution: res.data.contribution,
        alreadyRecorded: res.data.alreadyRecorded === true,
      };
    }

    if (res.status === 202) {
      if (Date.now() - startedAt > POLL_BUDGET_MS) {
        return {
          kind: "unsettled",
          message:
            res.data?.error ??
            "The chain has not confirmed this transaction yet.",
        };
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (res.status === 429) {
      return {
        kind: "unsettled",
        message: "Too many checks in a row. Wait a moment, then check again.",
      };
    }

    return {
      kind: "refused",
      message: res.data?.error ?? "The contribution could not be registered.",
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
