"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Meter } from "@/components/ui/meter";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { formatMoney, majorToMinor } from "@/lib/commerce/money";
import {
  readCompliance,
  setSelfCap,
  type CompliancePolicy,
  type ComplianceState,
} from "@/components/commerce/compliance-actions";

/* SPENDING, in the Vault, because the Vault is where a member goes to see what
 * is theirs and what has left.
 *
 * Archetype: Console. Flat, dense, right aligned figures on `tnum`, no
 * ornament. This is a reading, not a reward, and a spending total rendered in
 * the Forge register would be the product congratulating somebody for spending.
 *
 * REAL DATA ONLY, and here it is unusually literal: every figure is the sum of
 * real orders computed by public.commerce_spend_minor, the same function the
 * checkout guard uses to decide. A member is looking at the number that will
 * actually stop them, not a client side approximation of it.
 *
 * THE PANEL DISAPPEARS FOR A MEMBER WHO HAS NEVER SPENT AND SET NO LIMIT. An
 * empty spending panel on a Console is noise, and telling somebody who has
 * bought nothing that they have 1,000 dollars of headroom is an invitation
 * dressed as information. It appears the moment there is something true to say.
 *
 * THE CONTROL IS ONE DIRECTION FAST AND THE OTHER SLOW, deliberately. A member
 * lowering their own ceiling is obeyed immediately. A member raising it waits a
 * day, and the pending value is shown so nobody is surprised by their own
 * decision. That asymmetry is the entire difference between a self-limit and a
 * slider, and it is enforced in public.commerce_set_self_cap rather than here.
 */

/* The rungs a member can choose, in dollars. Round numbers a person can
   actually reason about rather than a slider that invites fiddling, and the
   realm's own ceiling is always the last rung so the member can see what they
   are choosing under. */
const RUNGS_USD = [50, 100, 250, 500];

export function SpendLimitsPanel() {
  const [policy, setPolicy] = useState<CompliancePolicy | null>(null);
  const [state, setState] = useState<ComplianceState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "absent">(
    "loading"
  );
  const [note, setNote] = useState<string | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(async () => {
    const read = await readCompliance();
    if (!read) {
      setStatus("absent");
      return;
    }
    setPolicy(read.policy);
    setState(read.state);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = useCallback(
    async (capMinor: number | null) => {
      setStatus("saving");
      setNote(null);
      const res = await setSelfCap(capMinor);
      if (!res.ok) {
        setNote(res.error);
        setStatus("ready");
        return;
      }
      setNote(
        res.delayed
          ? `Raising a limit waits ${policy?.selfCapRaiseDelayHours ?? 24} hours. Your current limit still applies until then.`
          : "Set. It applies from now."
      );
      await load();
    },
    [load, policy]
  );

  if (showSkeleton) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Spending" />
        <Card radius="xl">
          <Skeleton className="h-20 w-full" />
        </Card>
      </section>
    );
  }

  if (status === "loading" || status === "absent" || !policy || !state) return null;

  const spentAnything = state.month_minor > 0 || state.day_minor > 0;
  const hasLimit = state.self_cap_minor !== null;
  if (!spentAnything && !hasLimit) return null;

  const effectiveMonthCap = Math.min(
    policy.monthCapMinor,
    state.self_cap_minor ?? policy.monthCapMinor
  );

  const busy = status === "saving";

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Spending" hint="What the realm has charged you" />

      <Card radius="xl" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Bar
            label="Last 24 hours"
            spentMinor={state.day_minor}
            capMinor={policy.dayCapMinor}
          />
          <Bar
            label="Last 30 days"
            spentMinor={state.month_minor}
            capMinor={effectiveMonthCap}
            note={
              state.self_cap_minor !== null
                ? "Your limit, below the realm's"
                : undefined
            }
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-steel-line pt-3.5">
          <p className="text-xs leading-relaxed text-bone-mut">
            You can hold yourself to less than the realm allows over 30 days.
            Lowering a limit applies at once. Raising one waits{" "}
            {policy.selfCapRaiseDelayHours} hours, on purpose: a limit you can
            lift the moment you want to lift it is not a limit.
          </p>

          <div className="flex flex-wrap gap-2">
            {RUNGS_USD.map((usd) => {
              const minor = majorToMinor(usd);
              if (minor >= policy.monthCapMinor) return null;
              const active = state.self_cap_minor === minor;
              return (
                <Button
                  key={usd}
                  size="sm"
                  dense
                  variant={active ? "gold" : "glass"}
                  disabled={busy}
                  onClick={() => void choose(minor)}
                >
                  {formatMoney({ minor, currency: "usd" })}
                </Button>
              );
            })}
            <Button
              size="sm"
              dense
              variant={state.self_cap_minor === null ? "gold" : "glass"}
              disabled={busy}
              onClick={() => void choose(null)}
            >
              No limit of my own
            </Button>
          </div>

          {state.pending_self_cap_minor !== null && state.pending_self_cap_at ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
              <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bone-faint" />
              A raise to{" "}
              <span className="tnum font-semibold text-bone">
                {formatMoney({
                  minor: state.pending_self_cap_minor,
                  currency: "usd",
                })}
              </span>{" "}
              takes effect on{" "}
              {new Date(state.pending_self_cap_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </p>
          ) : null}

          {note ? <p className="text-xs text-bone-mut">{note}</p> : null}
        </div>

        <p className="text-[11px] leading-relaxed text-bone-faint">
          These cover what the realm charges you. They cannot see what you spend
          on the Bazaar, where payment goes from your wallet to another
          member&apos;s and the realm is not a party to it.
        </p>
      </Card>
    </section>
  );
}

function Bar({
  label,
  spentMinor,
  capMinor,
  note,
}: {
  label: string;
  spentMinor: number;
  capMinor: number;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-bone-mut">
          {label}
          {note ? <span className="text-bone-faint"> &middot; {note}</span> : null}
        </span>
        <span className="tnum text-xs font-semibold text-bone">
          {formatMoney({ minor: spentMinor, currency: "usd" })}
          <span className="font-normal text-bone-faint">
            {" "}
            of {formatMoney({ minor: capMinor, currency: "usd" })}
          </span>
        </span>
      </div>
      {/* The figure is already written beside the bar, so the bar carries no
          label of its own and stays a decoration for a screen reader rather
          than a second reading of the same number.

          It is never tinted toward a warning as it fills. A member close to
          their own ceiling is not doing anything wrong and the bar should not
          scold them, it should just be legible. */}
      <Meter value={spentMinor} max={capMinor} />
    </div>
  );
}
