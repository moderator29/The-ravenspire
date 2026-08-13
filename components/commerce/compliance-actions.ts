"use client";

import { realmFetch } from "@/lib/auth/api";

/* The three things a member can do about their own guardrails, in one place.
 *
 * Not a hook and not a context. Each of these is a single write with no state
 * to share, and the surfaces that call them (the buy control's interruption,
 * the Alms panel, the limits panel in the Vault) are far enough apart that a
 * provider threaded through two server-rendered pages would be machinery
 * bought for nothing.
 *
 * Every one of them is a request whose answer the server computes. None of
 * them sends a number the server then trusts, which is the whole point: the
 * acknowledgement in particular deliberately has NO argument, because the total
 * a member is recorded as having seen must be the one the server worked out,
 * not one a client claimed to have shown them.
 */

export type ComplianceState = {
  age_attested_at: string | null;
  age_attested_minimum: number | null;
  age_verified_at: string | null;
  self_cap_minor: number | null;
  pending_self_cap_minor: number | null;
  pending_self_cap_at: string | null;
  acknowledged_at: string | null;
  acknowledged_spend_minor: number | null;
  day_minor: number;
  month_minor: number;
};

export type CompliancePolicy = {
  ageMinimum: number;
  dayCapMinor: number;
  dayWindowHours: number;
  monthCapMinor: number;
  monthWindowHours: number;
  acknowledgementThresholdMinor: number;
  acknowledgementValidHours: number;
  velocityOrders: number;
  velocityWindowMinutes: number;
  selfCapRaiseDelayHours: number;
};

export async function readCompliance(): Promise<{
  policy: CompliancePolicy;
  state: ComplianceState;
} | null> {
  const res = await realmFetch<{ policy: CompliancePolicy; state: ComplianceState }>(
    "/api/commerce/compliance"
  );
  if (!res.ok || !res.data?.policy || !res.data.state) return null;
  return { policy: res.data.policy, state: res.data.state };
}

/* Records that the member confirmed they are old enough. There is no "no":
   pressing the control IS the yes, and storing a refusal would turn a question
   somebody may reconsider into a mark on their account. */
export async function attestAge(): Promise<boolean> {
  const res = await realmFetch("/api/commerce/compliance", {
    method: "POST",
    json: { action: "attest_age" },
  });
  return res.ok;
}

/* Records that the member has seen their real 30 day total. Takes no total,
   deliberately: the server computes and stores what it computed. */
export async function acknowledgeSpend(): Promise<number | null> {
  const res = await realmFetch<{ result?: { acknowledged_spend_minor?: number } }>(
    "/api/commerce/compliance",
    { method: "POST", json: { action: "acknowledge" } }
  );
  if (!res.ok) return null;
  return res.data?.result?.acknowledged_spend_minor ?? null;
}

/* Sets or clears the member's own 30 day ceiling. Null clears it, which is a
   raise and waits out the delay like any other. The delay is applied on the
   server, not here, because a delay a client computes is a delay a client can
   skip. */
export async function setSelfCap(capMinor: number | null): Promise<{
  ok: boolean;
  delayed: boolean;
  error: string | null;
}> {
  const res = await realmFetch<{
    result?: { delayed?: boolean };
    error?: string;
  }>("/api/commerce/compliance", {
    method: "POST",
    json: { action: "set_self_cap", capMinor },
  });
  return {
    ok: res.ok,
    delayed: res.data?.result?.delayed === true,
    error: res.ok ? null : (res.data?.error ?? "That limit could not be set"),
  };
}
