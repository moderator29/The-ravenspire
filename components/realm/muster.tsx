"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { realmFetch } from "@/lib/auth/api";

/* THE MUSTER, on the surface.
 *
 * A cell in the realm strip and, when the window is open, the one Forge moment
 * in an otherwise flat row. The strip is the Ledger register and stays that
 * way: quiet, compact, one line. Answering the Muster is the Ceremony, so it
 * takes over a centred Modal, carries the 3D icon at its anchor size, shows
 * one number, and offers one action. That is the register split doing its job.
 * If the strip itself glowed, the moment it is announcing would mean nothing.
 *
 * THE CLOCK IS THE SERVER'S
 * Every instant here arrives from the server, together with the server's own
 * `now`. The component measures the difference between the two once, on
 * arrival, and every countdown it draws is against that offset rather than
 * against the browser's idea of the time. A member whose laptop is twenty
 * minutes fast sees the right countdown, and a member who sets their clock
 * forward deliberately gains nothing at all: the claim is decided in
 * public.claim_muster against the database's clock, and this surface can only
 * ever render a label. */

export interface MusterPayload {
  open: boolean;
  opensAt: string;
  closesAt: string;
  now: string;
  claimed: boolean | null;
  vigil: number | null;
  best: number | null;
  nextGlory: number | null;
  crestAt: number;
  crestHeld: boolean | null;
}

interface ClaimResult {
  ok?: boolean;
  vigil?: number;
  best?: number;
  offered?: number;
  glory?: number;
  capped?: boolean;
  muster?: MusterPayload;
  error?: string;
  reason?: string;
}

/* A countdown, in the coarsest unit that is still useful, and never past zero.
 *
 * Coarse above an hour and precise below it, because the two are different
 * jobs: "opens in 7 hours" is all a member needs at breakfast, and "12:04
 * left" is what they need once they are inside a window they can lose. */
function countdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) {
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const minutes = totalMinutes;
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* Ticks once a second while a window is open and once a minute otherwise.
 *
 * A one second interval running all day to redraw a label that says "7h" is
 * a wasted wakeup on a phone every second for hours. Inside a window the
 * seconds are the point, because the member is watching something run out. */
function useServerClock(payload: MusterPayload | null) {
  const skewRef = useRef(0);
  const [tick, setTick] = useState(0);

  const serverNow = payload?.now;
  useEffect(() => {
    if (!serverNow) return;
    const parsed = Date.parse(serverNow);
    if (Number.isFinite(parsed)) skewRef.current = parsed - Date.now();
  }, [serverNow]);

  const open = payload?.open === true;
  useEffect(() => {
    const period = open ? 1000 : 60_000;
    const id = setInterval(() => setTick((t) => t + 1), period);
    return () => clearInterval(id);
  }, [open]);

  return useCallback(() => {
    /* tick is read so the callback's consumers re-render on every interval.
       Without it the memo below would hold the first value forever. */
    void tick;
    return Date.now() + skewRef.current;
  }, [tick]);
}

export function MusterCell({
  muster,
  onChange,
}: {
  muster: MusterPayload;
  onChange: (next: MusterPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const toast = useToast();
  const now = useServerClock(muster);

  const claimed = muster.claimed === true;
  const vigil = muster.vigil ?? 0;

  const label = useMemo(() => {
    const t = now();
    if (muster.open && !claimed) {
      return {
        kicker: "The Muster",
        value: `Open, ${countdown(Date.parse(muster.closesAt) - t)} left`,
        gold: true,
      };
    }
    if (claimed) {
      return {
        kicker: "Vigil",
        value: vigil === 1 ? "1 day" : `${vigil} days`,
        gold: false,
      };
    }
    return {
      kicker: "The Muster",
      value: `Opens in ${countdown(Date.parse(muster.opensAt) - t)}`,
      gold: false,
    };
  }, [muster, claimed, vigil, now]);

  /* Actionable only when there is genuinely something to do. A control that
     opens a dialog saying "come back later" is a control that has taught the
     member to ignore it. */
  const actionable = muster.open && !claimed;

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    const res = await realmFetch<ClaimResult>("/api/muster", { method: "POST" });
    setClaiming(false);

    if (res.data?.muster) onChange(res.data.muster);

    if (!res.ok || !res.data?.ok) {
      setResult(null);
      setOpen(false);
      toast.show({
        tone: "info",
        title: res.data?.error ?? "The Muster could not be answered.",
      });
      return;
    }
    setResult(res.data);
  }

  const body = (
    <span className="flex min-w-0 flex-col justify-center gap-0.5">
      <span className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
        {label.kicker}
      </span>
      <span
        className={`flex items-center gap-1.5 truncate text-[13px] font-medium ${
          label.gold ? "text-gold" : "text-bone"
        }`}
      >
        <Icon
          name={label.gold ? "flame" : "bell"}
          className={`h-3.5 w-3.5 shrink-0 ${label.gold ? "text-gold" : "text-bone-faint"}`}
        />
        <span className="tnum truncate">{label.value}</span>
      </span>
    </span>
  );

  return (
    <>
      {actionable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          /* A rounded rectangle from the scale, never a capsule. Same box as
             the strip's other cells so the row stays one instrument, with the
             gold reading as the only difference. */
          className="group flex min-w-0 shrink-0 flex-col justify-center rounded-md px-2.5 py-2 text-left transition-colors duration-fast ease-out-quint hover:bg-panel/60 max-md:min-h-11 md:flex-1 md:shrink"
        >
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 shrink-0 flex-col justify-center rounded-md px-2.5 py-2 max-md:min-h-11 md:flex-1 md:shrink">
          {body}
        </span>
      )}

      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setResult(null);
        }}
        size="sm"
        title={result ? "The vigil holds" : "The Muster is called"}
        footer={
          result ? (
            <Button variant="glass" size="md" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : (
            <Button
              variant="gold"
              size="md"
              onClick={claim}
              disabled={claiming}
            >
              {claiming ? "Answering" : "Answer the Muster"}
            </Button>
          )
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          {/* The Ceremony anchor. Never captioned: the copy below carries the
              meaning and a label under an icon is an admission it failed. */}
          <Icon3D name="brazier" size="lg" />

          {result ? <ClaimBody result={result} muster={muster} /> : <OfferBody muster={muster} />}
        </div>
      </Modal>
    </>
  );
}

function OfferBody({ muster }: { muster: MusterPayload }) {
  const vigil = muster.vigil ?? 0;
  const glory = muster.nextGlory ?? 0;
  const crestAt = muster.crestAt;
  const toCrest = Math.max(0, crestAt - (vigil + 1));

  return (
    <>
      <p className="text-sm leading-relaxed text-bone-mut">
        The realm musters twice a day, two hours each time. Answer inside the
        window and the vigil holds.
      </p>
      <p className="font-display text-3xl font-semibold text-gold">
        <span className="tnum">{glory}</span>{" "}
        <span className="text-base font-normal text-bone-mut">Glory</span>
      </p>
      <p className="text-xs leading-relaxed text-bone-faint">
        {vigil > 0
          ? `Your vigil stands at ${vigil} ${vigil === 1 ? "day" : "days"}.`
          : "This would begin a new vigil."}{" "}
        {muster.crestHeld
          ? "You already hold the Lord of Light."
          : toCrest > 0
            ? `${toCrest} more ${toCrest === 1 ? "day" : "days"} earns the Lord of Light.`
            : "This claim earns the Lord of Light."}
      </p>
      {/* The honest small print, and it is on the offer rather than only on
          the disappointment. The Muster spends the daily Renown allowance a
          member already had rather than minting on top of it, so a member who
          has already earned their day is paid nothing, and they are entitled
          to know that before they press the button rather than after. */}
      <p className="text-[11px] leading-relaxed text-bone-faint">
        The Muster draws on the same daily allowance your ravens and cheers
        spend. A day already earned pays nothing here, and the vigil holds
        either way.
      </p>
    </>
  );
}

function ClaimBody({
  result,
  muster,
}: {
  result: ClaimResult;
  muster: MusterPayload;
}) {
  const vigil = result.vigil ?? 0;
  const glory = result.glory ?? 0;
  const offered = result.offered ?? 0;
  const paidNothing = glory === 0 && offered > 0;

  return (
    <>
      <p className="font-display text-3xl font-semibold text-gold">
        <span className="tnum">{vigil}</span>{" "}
        <span className="text-base font-normal text-bone-mut">
          {vigil === 1 ? "day" : "days"}
        </span>
      </p>
      {paidNothing ? (
        /* Not an error, and not dressed as one. A member who has already spent
           the day's allowance has already earned their day, and saying so
           plainly is more respectful than showing them a zero. */
        <p className="text-sm leading-relaxed text-bone-mut">
          You had already earned today&apos;s Renown before the Muster was
          called, so there was none left to pay. The vigil holds all the same.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-bone-mut">
          The realm marks you present.{" "}
          <span className="font-semibold text-gold tnum">{glory}</span> Glory to
          your banner.
        </p>
      )}
      <p className="text-xs leading-relaxed text-bone-faint">
        {result.best && result.best > vigil
          ? `Your longest vigil is ${result.best} days.`
          : muster.crestHeld || vigil >= muster.crestAt
            ? "The Lord of Light is yours."
            : `${muster.crestAt - vigil} more ${muster.crestAt - vigil === 1 ? "day" : "days"} earns the Lord of Light.`}
      </p>
    </>
  );
}
