"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { realmFetch } from "@/lib/auth/api";
import {
  ENDOWMENT_REFUSAL_TEXT,
  planEndowment,
  splitEndowment,
} from "@/lib/houses/endowment";
import type { HouseEndowmentView } from "@/lib/houses/view";
import { TREASURY_POWERS } from "@/lib/houses/endowment";

/* THE ENDOWMENT, on the House hall's treasury tab.

   The one act in the realm where a member hands over a balance and gets no
   number back, so the surface has exactly one job: make sure nobody is
   surprised. Three figures are printed before the button can be pressed, in the
   same order the arithmetic runs, and they are computed by the same pure module
   the server calls (lib/houses/endowment.ts) rather than by a copy of it here.

   Ledger register, no ornament. This is not a moment to be celebrated with
   gold: a member is destroying half of something they earned, on purpose, and a
   surface that made it feel like a reward would be selling it to them. The
   Forge belongs to a House winning something, not to the page where it does its
   accounts.

   Base UI Dialog through the Modal primitive, never a hand rolled portal. */

interface EndowResponse {
  ok?: boolean;
  replayed?: boolean;
  committed?: number;
  toTreasury?: number;
  destroyed?: number;
  error?: string;
}

/* One uuid per gift, carried through every retry.

   An endowment has no natural idempotency key: the same member may give the
   same House the same amount twice in a minute and both are real. So the id is
   minted here, when the member opens the dialog, and reused for every attempt
   at that one gift. A retry after a timeout lands on the unique index in
   public.endow_house_treasury and moves nothing. Without it, a flaky connection
   costs a member their balance twice for one act. */
function mintRequestId(): string {
  return crypto.randomUUID();
}

export function EndowPanel({
  slug,
  houseName,
  endowment,
  onGiven,
}: {
  slug: string;
  houseName: string;
  endowment: HouseEndowmentView;
  onGiven: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState(mintRequestId);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<EndowResponse | null>(null);

  const amount = Number(raw);
  const plan = useMemo(
    () =>
      planEndowment({
        raw: raw.trim() === "" ? undefined : amount,
        balance: endowment.balance,
        committedToday: endowment.given_today,
        sworn: true,
      }),
    [raw, amount, endowment.balance, endowment.given_today]
  );

  /* The preview is drawn from the plan when it is valid and from nothing when
     it is not. A split shown beside a refusal would be a promise the button
     cannot keep. */
  const preview = plan.ok ? plan.split : null;
  const remaining = Math.max(0, endowment.daily_cap - endowment.given_today);

  const give = async () => {
    if (busy || !plan.ok) return;
    setBusy(true);
    setError(null);
    const res = await realmFetch<EndowResponse>(
      `/api/houses/${encodeURIComponent(slug)}/endow`,
      { method: "POST", json: { amount: plan.split.committed, request_id: requestId } }
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error ?? "The treasury would not take it.");
      return;
    }
    setDone(res.data);
    onGiven();
  };

  const reset = (next: boolean) => {
    setOpen(next);
    if (next) {
      /* A fresh gift is a fresh key. Reusing the previous one would make a
         second, genuine endowment silently do nothing. */
      setRequestId(mintRequestId());
      setRaw("");
      setError(null);
      setDone(null);
    }
  };

  return (
    <Card variant="raised">
      <div className="flex items-start gap-2.5">
        <Icon name="banner" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-bone">
            Fill the treasury yourself
          </p>
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            A treasury fills with what its members lose. You can also give it
            what you hold. Half of anything you commit reaches the banner and
            half is destroyed, exactly as a burned stake is, so giving is a gift
            and never a purchase.
          </p>
          <p className="tnum mt-2 text-[11px] text-bone-faint">
            You hold {endowment.balance.toLocaleString()} POINTS ·{" "}
            {remaining.toLocaleString()} of today&apos;s{" "}
            {endowment.daily_cap.toLocaleString()} left to give
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Modal
          open={open}
          onOpenChange={reset}
          title={`Endow ${houseName}`}
          description="Half reaches the banner. Half leaves the realm for good."
          trigger={
            <Button
              variant="glass"
              size="md"
              /* No control at all when the chapter is sealed or the member has
                 nothing left to give today, rather than a dead one. A disabled
                 button is a promise the screen cannot keep. */
              disabled={!endowment.open || endowment.max === 0}
            >
              Endow the House
            </Button>
          }
          footer={
            done ? (
              <Button variant="glass" size="md" onClick={() => reset(false)}>
                Close
              </Button>
            ) : (
              <Button
                variant="gold"
                size="md"
                onClick={() => void give()}
                loading={busy}
                disabled={busy || !plan.ok}
              >
                {preview
                  ? `Commit ${preview.committed.toLocaleString()} POINTS`
                  : "Commit"}
              </Button>
            )
          }
        >
          {done ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-relaxed text-bone">
                {done.replayed
                  ? "That gift had already landed. Nothing was taken twice."
                  : `${(done.toTreasury ?? 0).toLocaleString()} POINTS reached the banner. ${(done.destroyed ?? 0).toLocaleString()} left the realm.`}
              </p>
              <p className="text-xs leading-relaxed text-bone-faint">
                Your name is on the movement, permanently. Giving earns no
                Renown and no Glory: it cannot move you toward Lord or Hand, and
                that is deliberate, or a member could buy the right to spend the
                treasury they had just filled.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field
                label="POINTS to commit"
                description={`Between ${endowment.min.toLocaleString()} and ${endowment.max.toLocaleString()}`}
                error={
                  raw.trim() !== "" && !plan.ok
                    ? ENDOWMENT_REFUSAL_TEXT[plan.reason]
                    : undefined
                }
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={endowment.min}
                  max={endowment.max}
                  step={1}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={String(endowment.min)}
                />
              </Field>

              {/* The three figures, in the order the arithmetic runs. Printed
                  before the button can be pressed, the same way the Bazaar
                  prints a sale's three numbers before a listing exists. */}
              <div className="flex flex-col gap-1.5 rounded-lg border border-steel-line bg-void/50 px-3 py-2.5">
                <Line label="You commit" value={preview?.committed} />
                <Line label={`Reaches ${houseName}`} value={preview?.toTreasury} />
                <Line label="Destroyed for good" value={preview?.destroyed} />
              </div>

              <p className="text-[11px] leading-relaxed text-bone-faint">
                A treasury can only be spent on the perks in the catalogue, by
                the Lord or the Hand. It cannot be withdrawn, cannot be shared
                out, cannot buy Renown or Glory, and does not leave with you if
                you leave. What you give is gone from your balance either way.
              </p>

              {error ? (
                <p role="alert" className="text-xs text-state-danger">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </Modal>

        {!endowment.open ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 text-[11px] font-semibold text-bone-faint">
            <Icon name="lock" className="h-3 w-3 text-gold" />
            Gifts open when the treasury does
          </span>
        ) : endowment.max === 0 ? (
          <span className="text-[11px] text-bone-faint">
            {endowment.balance < endowment.min
              ? `You need ${endowment.min.toLocaleString()} POINTS to make the smallest gift`
              : "You have given all you may today"}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-bone-faint">{label}</span>
      {/* A dash is not a figure. Until the member has typed an amount the
          realm has nothing to promise, so the line holds its place and stays
          blank rather than showing a zero somebody could read as the answer. */}
      <span className="tnum font-semibold text-bone">
        {value === undefined ? "" : value.toLocaleString()}
      </span>
    </div>
  );
}

/* What a treasury may and may not do, printed on the hall rather than left in a
   document nobody opens. The list is the one in lib/houses/endowment.ts, so the
   promise a member reads and the properties the schema enforces are the same
   text. */
export function TreasuryPowers() {
  return (
    <Card variant="raised">
      <p className="text-[10px] uppercase tracking-[0.18em] text-bone-faint">
        What a treasury can do
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {TREASURY_POWERS.can.map((line) => (
          <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
            <Icon name="check" className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-bone-faint">
        And what it cannot
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {TREASURY_POWERS.cannot.map((line) => (
          <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
            <Icon name="close" className="mt-0.5 h-3 w-3 shrink-0 text-bone-faint" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
