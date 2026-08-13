"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  formatCeilingEther,
  parseCeilingEther,
  parseCeilingWei,
} from "@/lib/chain/signing-ceiling";
import {
  readWalletGuardrails,
  setSigningCeiling,
  type GuardrailsRead,
} from "@/components/wallet/wallet-guardrails-actions";

/* THE SIGNING CEILING: the most a Ravenspire surface will ask you to sign.
 *
 * WHY THIS IS NOT THE SPENDING LIMIT TWO PANELS UP, and why the copy says so in
 * the panel rather than only in a migration comment. The spending limit in
 * components/commerce/spend-limits-panel.tsx caps what the realm may CHARGE, in
 * dollars, and it is enforced inside the checkout transaction because the realm
 * is the party taking the money. This caps what the realm may ASK YOU TO SIGN,
 * in ETH, and it binds Ravenspire rather than the member's keys, because rule 6
 * means the realm is never a party to an on-chain transfer and holds nothing
 * that could refuse one.
 *
 * A member who read one of these and believed they had also set the other would
 * be worse off than a member who had set neither, because they would think they
 * were covered. So the panel names what it does not do, in the panel, at the
 * size a person actually reads.
 *
 * WHAT IT IS GENUINELY GOOD FOR: a fat finger on the Bazaar, and a Ravenspire
 * screen that has been tampered with asking for more than the member ever
 * intended. Both are real and both are stopped by this. What it cannot stop is
 * the member themselves, in another wallet interface, and the panel says that
 * too.
 *
 * THE CONTROL IS FAST ONE WAY AND SLOW THE OTHER, the same asymmetry the
 * spending limit has and for the same reason, which is about limits in general
 * and not about money: lowering applies at once, raising waits a day. Enforced
 * in public.wallet_set_tx_ceiling rather than here, because a delay a client
 * computes is a delay a client can skip.
 *
 * Archetype: Console. Ornament budget zero.
 */

/* The rungs, in ETH. Round numbers a person can reason about rather than a
   slider that invites fiddling. Zero is first and is a real position: a member
   who only ever claims cards is saying no Ravenspire screen may ask them to move
   value at all, and on Base a claim moves none. */
const RUNGS_ETH = ["0", "0.01", "0.1", "1"] as const;

export function SigningLimitPanel() {
  const [read, setRead] = useState<GuardrailsRead | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "absent">(
    "loading"
  );
  const [note, setNote] = useState<string | null>(null);
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  const load = useCallback(async () => {
    const next = await readWalletGuardrails();
    if (!next) {
      setStatus("absent");
      return;
    }
    setRead(next);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = useCallback(
    async (ceilingWei: bigint | null) => {
      setStatus("saving");
      setNote(null);
      const res = await setSigningCeiling(ceilingWei);
      if (!res.ok) {
        setNote(res.error);
        setStatus("ready");
        return;
      }
      setNote(
        res.delayed
          ? `Raising a ceiling waits ${read?.policy.ceilingRaiseDelayHours ?? 24} hours. Your current ceiling still applies until then.`
          : "Set. It applies from now."
      );
      await load();
    },
    [load, read]
  );

  if (showSkeleton) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Signing ceiling" />
        <Card radius="xl" pad="md">
          <Skeleton className="h-20 w-full" />
        </Card>
      </section>
    );
  }

  if (status === "loading" || status === "absent" || !read) return null;

  /* A malformed value from an older row renders as "no ceiling" rather than
     throwing a whole Console away over one string. */
  const current =
    read.state.tx_ceiling_wei === null
      ? null
      : parseCeilingWei(read.state.tx_ceiling_wei);
  const pending =
    read.state.pending_tx_ceiling_wei === null
      ? null
      : parseCeilingWei(read.state.pending_tx_ceiling_wei);

  const busy = status === "saving";

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Signing ceiling"
        hint="The most native coin the realm will ask you to move"
      />

      <Card radius="xl" pad="md" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-bone-mut">In force now</span>
          <span className="tnum text-sm font-semibold text-bone">
            {current === null ? "No ceiling" : `${formatCeilingEther(current)} ETH`}
          </span>
        </div>

        <div className="flex flex-col gap-2 border-t border-steel-line pt-3.5">
          <p className="text-xs leading-relaxed text-bone-mut">
            No Ravenspire screen will build a transaction moving more native coin
            than this without you raising it first. Lowering applies at once.
            Raising waits {read.policy.ceilingRaiseDelayHours} hours, on purpose:
            a ceiling you can lift the moment you want to lift it is not a
            ceiling.
          </p>

          <div className="flex flex-wrap gap-2">
            {RUNGS_ETH.map((eth) => {
              const wei = parseCeilingEther(eth);
              if (wei === null) return null;
              const active = current !== null && current === wei;
              return (
                <Button
                  key={eth}
                  size="sm"
                  dense
                  variant={active ? "gold" : "glass"}
                  disabled={busy}
                  onClick={() => void choose(wei)}
                >
                  {eth} ETH
                </Button>
              );
            })}
            <Button
              size="sm"
              dense
              variant={current === null ? "gold" : "glass"}
              disabled={busy}
              onClick={() => void choose(null)}
            >
              No ceiling
            </Button>
          </div>

          {pending !== null && read.state.pending_tx_ceiling_at ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
              <Icon
                name="info"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bone-faint"
              />
              <span>
                A raise to{" "}
                <span className="tnum font-semibold text-bone">
                  {formatCeilingEther(pending)} ETH
                </span>{" "}
                takes effect on{" "}
                {new Date(read.state.pending_tx_ceiling_at).toLocaleString(
                  undefined,
                  { dateStyle: "medium", timeStyle: "short" }
                )}
                .
              </span>
            </p>
          ) : null}

          {note ? <p className="text-xs text-bone-mut">{note}</p> : null}
        </div>

        {/* The two sentences that stop this being mistaken for something wider
            than it is. Both are load bearing and neither belongs only in a
            document: a member who misreads either one is worse off than a
            member who never set a ceiling. */}
        <p className="text-[11px] leading-relaxed text-bone-faint">
          This binds Ravenspire, not your keys. Your wallet is yours, so you can
          always sign anything you like somewhere else, and nothing here could
          stop you. It is also a different thing from the spending limit above,
          which covers what the realm charges you in dollars and cannot see the
          chain at all.
        </p>
        <p className="text-[11px] leading-relaxed text-bone-faint">
          It covers native coin only: ETH on Base, and the equivalent on any
          other chain your wallet is on. It does not cover tokens like USDC,
          because comparing a token amount against a ceiling in ETH would need a
          live price and the realm does not buy one. A ceiling that looked like
          it had checked a stablecoin transfer and had not would be worse than no
          ceiling.
        </p>
      </Card>
    </section>
  );
}
