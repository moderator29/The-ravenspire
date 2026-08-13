"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/commerce/money";
import { acknowledgeSpend, attestAge } from "@/components/commerce/compliance-actions";

/* THE INTERRUPTION: what a member sees when a guardrail stops a purchase.
 *
 * Two rules shaped every decision in this file.
 *
 * IT IS A MODAL, NOT AN INLINE LINE OF TEXT. An interruption that can be
 * scrolled past is not one. Base UI's Dialog traps focus, locks the background
 * scroll, restores focus on close and portals to document.body, so this cannot
 * be dismissed by accident and cannot be clipped by a transformed ancestor
 * (rule 16). A member being told they have spent 260 dollars in a month is
 * owed the whole screen for a moment.
 *
 * IT ALWAYS CARRIES THE REAL NUMBER. "You cannot do that right now" is the
 * shape of a dark pattern. "You have spent 260 in the last 30 days" is the
 * shape of an interruption. Every refusal the server sends comes with the
 * member's own totals attached, and this renders them rather than hiding them
 * behind a generic apology.
 *
 * THE REGISTER IS THE LEDGER, deliberately. No gold gradient, no 3D icon, no
 * glow. Ornament is earned and this is not a reward: the Forge register on a
 * spending limit would be the product celebrating the fact that somebody is
 * about to spend more, which is exactly the thing this exists to interrupt.
 *
 * TWO REFUSALS CAN BE CLEARED HERE AND THE REST CANNOT, and that asymmetry is
 * the honest part. The age gate and the acknowledgement are answered by the
 * member, so they carry an action. A spending cap, a self-set cap and the
 * velocity brake are answered by time, so they carry a date and no button at
 * all. Adding an "override" to any of the three would undo the entire
 * guardrail, and there is deliberately no route that would accept one.
 */

export type GuardRefusal = {
  reason: string;
  error: string;
  state: {
    day_minor?: number;
    day_cap_minor?: number;
    month_minor?: number;
    month_cap_minor?: number;
    self_cap_minor?: number | null;
    amount_minor?: number;
  } | null;
  clearsAt: string | null;
  capMinor: number | null;
  thresholdMinor: number | null;
  minimum: number | null;
};

function usd(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return formatMoney({ minor, currency: "usd" });
}

/* A date a member can read, in their own locale and their own zone. The server
   sends an instant; turning it into "in about forty minutes" would be a guess
   that goes stale while the modal is open. */
function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function GuardInterruption({
  refusal,
  onDismiss,
  onCleared,
}: {
  refusal: GuardRefusal | null;
  onDismiss: () => void;
  /* Called after the member clears a refusal they can clear. The buy control
     retries the purchase, so the interruption costs a member one press rather
     than sending them back to find the chest again. */
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!refusal) return null;

  const state = refusal.state ?? {};
  const clearable = refusal.reason === "age_gate" || refusal.reason === "acknowledgement";

  const act = async () => {
    setBusy(true);
    setFailed(false);
    const ok =
      refusal.reason === "age_gate"
        ? await attestAge()
        : (await acknowledgeSpend()) !== null;
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    onCleared();
  };

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      size="sm"
      title={TITLE[refusal.reason] ?? "The realm is pausing"}
      description={refusal.error}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDismiss} dense>
            {clearable ? "Not now" : "Close"}
          </Button>
          {clearable ? (
            <Button variant="gold" loading={busy} onClick={() => void act()}>
              {refusal.reason === "age_gate"
                ? `Yes, I am ${refusal.minimum ?? 18} or older`
                : "I have seen this, continue"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* The member's real figures, whichever ones the refusal turned on.
            Never a projection and never a target: what has actually been
            charged, in the window the limit is measured over. */}
        {refusal.reason !== "age_gate" ? (
          <dl className="flex flex-col gap-1.5 rounded-lg border border-steel-line bg-obsidian/60 p-3">
            <Row
              label="Spent in the last 24 hours"
              value={usd(state.day_minor)}
              of={usd(state.day_cap_minor)}
            />
            <Row
              label="Spent in the last 30 days"
              value={usd(state.month_minor)}
              of={usd(
                state.self_cap_minor ?? state.month_cap_minor ?? refusal.capMinor
              )}
            />
            {state.amount_minor ? (
              <Row label="This purchase" value={usd(state.amount_minor)} />
            ) : null}
          </dl>
        ) : null}

        {refusal.clearsAt ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bone-faint" />
            Checkout opens again at {when(refusal.clearsAt)}.
          </p>
        ) : null}

        {refusal.reason === "age_gate" ? (
          <p className="text-xs leading-relaxed text-bone-mut">
            The realm asks once, stores only that you answered and when, and
            never asks for a date of birth. It asks before payment and nowhere
            else.
          </p>
        ) : null}

        {refusal.reason === "acknowledgement" ? (
          <p className="text-xs leading-relaxed text-bone-mut">
            You can set your own limit below the realm&apos;s at any time, in
            the Vault. Lowering it takes effect at once.
          </p>
        ) : null}

        {failed ? (
          <p className="text-xs text-state-danger">
            That did not save. Try again in a moment.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

const TITLE: Record<string, string> = {
  age_gate: "Before the realm takes payment",
  acknowledgement: "What you have spent",
  spend_cap_day: "The realm's daily limit",
  spend_cap_month: "The realm's monthly limit",
  self_cap: "The limit you set",
  velocity: "The realm is pausing",
  geo_blocked: "Not available here",
  geo_unknown: "Not available here",
};

function Row({
  label,
  value,
  of,
}: {
  label: string;
  value: string;
  of?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-bone-mut">{label}</dt>
      <dd className="tnum text-xs font-semibold text-bone">
        {value}
        {of ? <span className="font-normal text-bone-faint"> of {of}</span> : null}
      </dd>
    </div>
  );
}
