"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { parseCeilingWei } from "@/lib/chain/signing-ceiling";

/* Reading and setting the member's own wallet guardrails.
 *
 * A module of functions rather than a hook or a context, matching
 * components/commerce/compliance-actions.ts: each of these is a single request
 * with no state worth sharing, and the surfaces that call them are far enough
 * apart that a provider threaded through them would be machinery bought for
 * nothing.
 *
 * WEI CROSSES THE WIRE AS A STRING, always. A JSON number is a double, and a
 * double is inexact above 2^53, which in wei is under a hundredth of an ETH. A
 * ceiling that arrived as a number would be a ceiling the member did not set.
 */

export type SponsorshipReport =
  | { permitted: true; chainId: number | null }
  | { permitted: false; reason: string; sentence: string };

export type GuardrailsState = {
  /* Decimal strings of wei, or null. Parsed with parseCeilingWei at the point
     of use rather than here, so a malformed value from an older row becomes a
     rendering decision rather than a thrown fetch. */
  tx_ceiling_wei: string | null;
  pending_tx_ceiling_wei: string | null;
  pending_tx_ceiling_at: string | null;
  member_used: number;
  member_allowance: number;
  realm_used: number;
  realm_allowance: number;
};

export type GuardrailsPolicy = {
  windowHours: number;
  memberAllowance: number;
  realmAllowance: number;
  ceilingRaiseDelayHours: number;
};

export type GuardrailsRead = {
  policy: GuardrailsPolicy;
  state: GuardrailsState;
  sponsorship: SponsorshipReport;
};

/* ONE READ PER PAGE, NOT ONE PER CONTROL.
 *
 * useSponsorship is meant to be safe to call from a control, and the Hoard
 * renders a claim control per card. Uncached, a member holding forty cards would
 * fire forty identical requests at this route on every render of that panel,
 * each verifying a Privy token and running two counting queries. So the
 * in-flight promise is shared and the answer is held briefly.
 *
 * The window is short because the counters move: a member who has just claimed
 * something has one fewer sponsored act, and a stale "the realm covers this" is
 * the one kind of stale this module must not serve.
 *
 * The cache lives here rather than in the hook so that the write below can
 * invalidate its own read. A cache a writer has to remember to clear is a cache
 * that eventually serves a member the ceiling they just changed away from.
 *
 * Failures are held for the same window on purpose, matching lib/flags.ts: an
 * unreachable route asked once per window beats once per control.
 */
const READ_TTL_MS = 15_000;

let cached: { at: number; read: GuardrailsRead | null } | null = null;
let inFlight: Promise<GuardrailsRead | null> | null = null;

/* Drops the held answer so the next read goes to the server. Exported because
   the surfaces that change the counters (a claim landing) live in different
   files from the ones that change the ceiling. */
export function forgetWalletGuardrails(): void {
  cached = null;
}

/* Null when the guardrails are unreachable: not migrated, not configured, or
   the caller is signed out. Every surface treats that as "say nothing" rather
   than as an error, because a Vault panel shouting about a migration is noise
   to the one person who cannot do anything about it. */
export function readWalletGuardrails(): Promise<GuardrailsRead | null> {
  const now = Date.now();
  if (cached && now - cached.at < READ_TTL_MS) {
    return Promise.resolve(cached.read);
  }
  if (inFlight) return inFlight;
  inFlight = fetchWalletGuardrails()
    .then((read) => {
      cached = { at: Date.now(), read };
      return read;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function fetchWalletGuardrails(): Promise<GuardrailsRead | null> {
  const res = await realmFetch<GuardrailsRead>("/api/wallet/guardrails");
  if (!res.ok || !res.data?.policy || !res.data.state || !res.data.sponsorship) {
    return null;
  }
  return res.data;
}

/* Sets or clears the member's ceiling on what a Ravenspire surface may ask them
   to sign. Null clears it, which is a raise and waits out the delay like any
   other. The delay is applied on the server, not here, because a delay a client
   computes is a delay a client can skip. */
export async function setSigningCeiling(ceilingWei: bigint | null): Promise<{
  ok: boolean;
  delayed: boolean;
  error: string | null;
}> {
  const res = await realmFetch<{
    result?: { delayed?: boolean };
    error?: string;
  }>("/api/wallet/guardrails", {
    method: "POST",
    json: {
      action: "set_ceiling",
      ceilingWei: ceilingWei === null ? null : ceilingWei.toString(),
    },
  });
  /* Unconditionally, including on a refusal. A failed write can still have
     landed (a response lost on the way back is indistinguishable from one that
     never happened), and serving a member the ceiling they just changed away
     from is the worse of the two mistakes. */
  forgetWalletGuardrails();
  return {
    ok: res.ok,
    delayed: res.data?.result?.delayed === true,
    error: res.ok ? null : (res.data?.error ?? "That ceiling could not be set"),
  };
}

/* The ceiling in force, for the surfaces that have to honour it before they
 * build a transaction.
 *
 * `ready` matters more than the value. A surface must not decide an amount is
 * within a ceiling it has not read yet: the honest sequence is to hold the
 * control until the answer is in, which takes one cached read, rather than to
 * assume "no ceiling" for the moment before it arrives and let a transaction
 * through the gap.
 *
 * A null ceiling with `ready` true means the member has genuinely set none.
 * A malformed stored value also reads as null: one bad string must not throw a
 * send flow away, and the safe direction for a value nobody can parse is the
 * one that matches a member who never set a ceiling at all.
 */
export function useSigningCeiling(): { ready: boolean; ceilingWei: bigint | null } {
  const [state, setState] = useState<{ ready: boolean; ceilingWei: bigint | null }>(
    { ready: false, ceilingWei: null }
  );

  useEffect(() => {
    let live = true;
    void readWalletGuardrails().then((read) => {
      if (!live) return;
      const raw = read?.state.tx_ceiling_wei ?? null;
      setState({
        ready: true,
        ceilingWei: raw === null ? null : parseCeilingWei(raw),
      });
    });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
