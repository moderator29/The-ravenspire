"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { realmFetch } from "@/lib/auth/api";
import { attestAge } from "@/components/commerce/compliance-actions";

/* THE ALMS: the free way to a chest, in plain sight beside the paid one.
 *
 * WHY IT LOOKS LIKE THIS. A free method of entry is only one if it is as easy
 * to find and as easy to take as the purchase it stands beside. So it sits on
 * the same page as the chests, in a full width card under them rather than in
 * a footnote, in a settings screen, or behind a link that says "other ways to
 * enter". A free path buried three screens deep is a free path in name.
 *
 * WHAT IT SAYS, AND WHAT IT REFUSES TO SAY. The chest the Alms grant is a real
 * Squire's Chest with the same printed odds, the same guaranteed rarity floor and the
 * same provable reveal, so the copy says exactly that and nothing softer. It
 * does not say "a chance to win", it does not dress the grant up as a prize,
 * and it never renders a number the server did not send: how many the realm has
 * left today, when this member may next claim, and how many they are already
 * holding unopened are all read from the server and shown as they are.
 *
 * THE REGISTER IS THE LEDGER. Flat, quiet, no gold gradient and no 3D icon. The
 * Forge belongs to the opening, which is where the reward actually happens. A
 * free entry that glowed harder than the chests would be the product using
 * ornament to sell the thing it exists to be an alternative to.
 *
 * EVERY RULE IS ENFORCED ON THE SERVER. Nothing here decides eligibility. The
 * panel can be wrong, stale or lied to by a modified client and the worst that
 * happens is a member presses a button and is told no by public.alms_claim.
 */

type AlmsPolicy = {
  chestSku: string;
  chestName: string;
  perMemberDays: number;
  minAccountAgeDays: number;
  dailyCeiling: number;
};

type AlmsState = {
  last_claim_at: string | null;
  next_at: string | null;
  eligible_at: string | null;
  unopened: number;
  remaining_today: number;
  resets_at: string | null;
};

function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function AlmsPanel() {
  const [policy, setPolicy] = useState<AlmsPolicy | null>(null);
  const [state, setState] = useState<AlmsState | null>(null);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState<
    "loading" | "ready" | "claiming" | "signed-out"
  >("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  const [needsAge, setNeedsAge] = useState(false);
  /* The clock reading `waiting` compares against, captured when the state was
     read rather than during render: calling Date.now() in render is impure and
     kept the panel out of the compiler. Waiting-as-of-load is the honest
     reading anyway, since next_at itself is only as fresh as the load. */
  const [loadedAt, setLoadedAt] = useState(0);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(async () => {
    const res = await realmFetch<{
      live?: boolean;
      policy?: AlmsPolicy;
      state?: AlmsState;
    }>("/api/commerce/alms");
    if (res.status === 401) {
      setStatus("signed-out");
      return;
    }
    if (!res.ok || !res.data?.policy || !res.data.state) {
      /* Nothing invented on a failure. The panel simply does not claim to know
         anything it could not read. */
      setStatus("signed-out");
      return;
    }
    setLive(res.data.live === true);
    setPolicy(res.data.policy);
    setState(res.data.state);
    setLoadedAt(Date.now());
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = useCallback(async () => {
    setStatus("claiming");
    setMessage(null);
    const res = await realmFetch<{
      ok?: boolean;
      error?: string;
      reason?: string;
    }>("/api/commerce/alms", { method: "POST", json: {} });

    if (res.ok && res.data?.ok) {
      setGranted(true);
      setMessage(null);
      setNeedsAge(false);
      await load();
      return;
    }

    setNeedsAge(res.data?.reason === "age_gate");
    setMessage(res.data?.error ?? "The Alms could not be given right now");
    setStatus("ready");
  }, [load]);

  const confirmAge = useCallback(async () => {
    setStatus("claiming");
    const ok = await attestAge();
    if (!ok) {
      setMessage("That did not save. Try again in a moment.");
      setStatus("ready");
      return;
    }
    setNeedsAge(false);
    await claim();
  }, [claim]);

  if (status === "signed-out") {
    /* Signed out, or the read failed. No specimen state and no invented
       countdown: the offer is stated, and taking it needs an account. */
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="The Alms" hint="A chest, given" />
        <Card radius="xl" className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-bone-mut">
            The realm gives one Squire&apos;s Chest, free, to a member who asks.
            Same cards, same printed odds, same guaranteed rarity floor, same proof.
            Sign in to take it.
          </p>
        </Card>
      </section>
    );
  }

  if (showSkeleton) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="The Alms" hint="A chest, given" />
        <Card radius="xl">
          <Skeleton className="h-16 w-full" />
        </Card>
      </section>
    );
  }

  if (status === "loading" || !policy || !state) return null;

  const held = state.unopened > 0;
  const waiting =
    state.next_at !== null && new Date(state.next_at).getTime() > loadedAt;
  const exhausted = state.remaining_today <= 0;
  const busy = status === "claiming";

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="The Alms"
        hint="A chest, given"
        /* The remaining count is on the header rather than buried in the body
           because it is the one number that decides whether the free path is
           actually available right now, and a member should not have to read a
           paragraph to find it. */
        action={
          live ? (
            <span className="tnum text-[11px] text-bone-faint">
              {state.remaining_today} of {policy.dailyCeiling} left today
            </span>
          ) : null
        }
      />

      <Card radius="xl" className="flex flex-col gap-3.5 md:flex-row md:items-start md:gap-5">
        <div className="flex flex-1 flex-col gap-2.5">
          <p className="text-sm leading-relaxed text-bone-mut">
            Chests can be bought. They can also be given. Once every{" "}
            {policy.perMemberDays} days the realm hands any member a real{" "}
            {policy.chestName}, free, and it is the same chest in every respect
            that matters: the same cards, the printed odds above, the same
            guaranteed rarity floor, and the same reveal you can check afterwards.
            There is no separate table of odds for a chest that was given.
          </p>

          <ul className="flex flex-col gap-1.5">
            <Line>
              One every {policy.perMemberDays} days, to an account at least{" "}
              {policy.minAccountAgeDays} days old.
            </Line>
            <Line>
              The realm gives {policy.dailyCeiling} a day. When they are gone
              they are given again at midnight UTC.
            </Line>
            <Line>
              It opens exactly where a bought chest opens, and proves itself the
              same way.
            </Line>
          </ul>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 md:w-56">
          {!live ? (
            <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Opens with the chests
            </p>
          ) : granted ? (
            <p className="text-sm font-semibold text-bone">
              Given. Your {policy.chestName} is waiting on this page.
            </p>
          ) : held ? (
            /* A member holding an unopened free chest is told so instead of
               being shown a countdown to the next one. The thing they want is
               already theirs. */
            <p className="text-sm leading-snug text-bone">
              You are holding {state.unopened} unopened{" "}
              {state.unopened === 1 ? "chest" : "chests"} from the Alms.
            </p>
          ) : waiting ? (
            <p className="text-xs leading-relaxed text-bone-mut">
              You have taken the Alms. They come round again on{" "}
              {when(state.next_at)}.
            </p>
          ) : exhausted ? (
            <p className="text-xs leading-relaxed text-bone-mut">
              Today&apos;s Alms are all given. The next are at{" "}
              {when(state.resets_at)}.
            </p>
          ) : needsAge ? (
            <Button variant="gold" loading={busy} onClick={() => void confirmAge()}>
              Yes, I am 18 or older
            </Button>
          ) : (
            <Button variant="gold" loading={busy} onClick={() => void claim()}>
              Take the Alms
            </Button>
          )}

          {message ? (
            <p className="text-[11px] leading-snug text-bone-mut">{message}</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
      <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
      {children}
    </li>
  );
}
