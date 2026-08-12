"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withDeadline } from "@/lib/deadline";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import {
  ConsoleHeader,
  ConsolePage,
  ConsoleStack,
  CONSOLE_PAD,
} from "@/components/console/console-shell";

const LOCKS = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "180d", label: "180d" },
  { id: "1y", label: "1y" },
] as const;

type LockId = (typeof LOCKS)[number]["id"];

export default function ForgePage() {
  /* null = still asking, boolean = the flag's answer */
  const [live, setLive] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("");
  const [lock, setLock] = useState<LockId>("90d");
  const [showWiring, setShowWiring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        /* supabase-js retries a failed read with backoff of its own, so this
           does not simply reject and fall through. Measured against an
           unreachable realm the attempts landed at +714ms, +1.9s, +4.3s and
           +8.5s, and until the last one gave up the badge was absent and a
           grey bar sat under the pitch: 9.5 seconds of a Console claiming a
           number was arriving. Against a socket that hangs rather than fails
           there is no last attempt at all. The deadline bounds both. */
        const { data, error } = await withDeadline(
          supabase
            .from("feature_flags")
            .select("enabled")
            .eq("key", "forge_staking")
            .maybeSingle()
        );
        if (!cancelled) setLive(!error && data ? Boolean(data.enabled) : false);
      } catch {
        /* Unknown reads as not live, which is the safe answer: nothing is
           signable until the flag says so anyway. */
        if (!cancelled) setLive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stoking = live !== true;
  const amountValid = /^\d*\.?\d+$/.test(amount.trim()) && Number(amount) > 0;

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Forge"
        kicker="Staking"
        badge={
          live === null ? undefined : stoking ? (
            <Badge variant="beta" icon="flame">
              Being stoked
            </Badge>
          ) : (
            <Badge variant="gold" icon="orb">
              Live on-chain
            </Badge>
          )
        }
      />

      <ConsoleStack className="mt-4 md:mt-3">
        {/* The pitch. One card, not a full bleed hero: a Console has no room
            for a marketing band above its controls. */}
        <Card variant="warm" pad="none" render={<section />} className={CONSOLE_PAD}>
          <p className="text-[11px] uppercase tracking-[0.26em] text-bone-faint">
            The oath of the anvil
          </p>
          <h2 className="gold-text font-display mt-1.5 text-lg font-semibold md:text-base">
            Swear an oath. Earn real yield from protocol fees, not emissions.
          </h2>
          <p className="mt-2 max-w-lg text-sm text-bone-mut md:text-[13px]">
            Stake $RSP, lock it at the anvil, and take a share of what the
            realm actually earns. No printed rewards, no borrowed shine.
          </p>
          {live === null ? (
            <Skeleton radius="sm" className="mt-2.5 h-4 w-40" />
          ) : null}
        </Card>

        {/* The figures. All three read as unavailable until the chain pays,
            which is the honest state, so they sit on one row. */}
        <div className="grid grid-cols-3 gap-2 md:gap-1.5">
          <Figure label="Current APR" />
          <Figure label="Staked" />
          <Figure label="Claimable" />
        </div>
        <p className="-mt-2 text-[11px] text-bone-faint md:-mt-1">
          Every figure here reads from the contract once staking is live. None
          is promised in advance, and none is shown before the chain has paid it.
        </p>

        {/* Stake */}
        <Card pad="none" render={<section />} className={CONSOLE_PAD}>
          <div className="flex items-center gap-2">
            <Icon name="coin" aria-hidden className="h-4 w-4 text-gold" />
            <h2 className="font-display text-sm font-semibold text-bone">
              Swear an oath
            </h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Stake
            </span>
          </div>

          <label className="mt-3 block md:mt-2">
            <span className="text-xs uppercase tracking-[0.2em] text-bone-faint">
              Amount ($RSP)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              disabled={stoking}
              className="tnum mt-1.5 h-11 w-full rounded-md border border-steel-line bg-panel/70 px-3 font-mono text-base text-bone transition-colors duration-fast placeholder:text-bone-faint focus:border-gold disabled:opacity-60 md:h-9 md:text-sm"
            />
          </label>

          <div className="mt-3 md:mt-2">
            <span className="text-xs uppercase tracking-[0.2em] text-bone-faint">
              Lock term
            </span>
            {/* Four exclusive terms, switched in place, so a Segmented control. */}
            <SegmentedControl
              label="Lock term"
              size="sm"
              block
              className="mt-1.5 tnum"
              items={LOCKS.map((l) => ({ value: l.id, label: l.label }))}
              value={lock}
              onValueChange={(v) => setLock(v as LockId)}
            />
            <p className="mt-1.5 text-[11px] text-bone-faint">
              Longer oaths earn a larger share of the fee pool.
            </p>
          </div>

          <Button
            variant="gold"
            size="lg"
            block
            className="mt-4 md:mt-3 md:h-9 md:w-auto md:text-sm"
            disabled={stoking || !amountValid}
            onClick={() => setShowWiring(true)}
          >
            Swear an Oath
          </Button>
          {stoking ? (
            <p className="mt-2 text-[11px] text-bone-faint">
              Oaths open when the forge_staking flag lights. Nothing to sign
              until then.
            </p>
          ) : !amountValid && amount.trim() !== "" ? (
            <p className="mt-2 text-[11px] text-ember">
              Enter a positive amount of $RSP to stake.
            </p>
          ) : null}
        </Card>

        {/* Claim */}
        <Card pad="none" render={<section />} className={CONSOLE_PAD}>
          <div className="flex items-center gap-2">
            <Icon name="shield" aria-hidden className="h-4 w-4 text-gold" />
            <h2 className="font-display text-sm font-semibold text-bone">
              Your position
            </h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Harvest
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={stoking}
              onClick={() => setShowWiring(true)}
            >
              Claim
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-bone-faint md:mt-1.5">
            You hold no oath yet, so there is nothing to count. Yield accrues
            from protocol fees as your oath holds, and the claimable figure
            reads straight from the contract once staking is live. We will never
            show a number the chain has not paid.
          </p>
        </Card>
      </ConsoleStack>

      <AdaptiveDialog
        open={showWiring}
        onOpenChange={setShowWiring}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <Icon name="flame" aria-hidden className="h-4 w-4 text-ember" />
            Almost at the anvil
          </span>
        }
        footer={
          <Button variant="gold" onClick={() => setShowWiring(false)}>
            Understood
          </Button>
        }
      >
        <p className="text-sm text-bone-mut">
          The staking flag is lit, but the on-chain contract wiring is the final
          step still being forged. No transaction will be signed and no coin will
          move until the anvil is truly hot. Your oath is recorded here the
          moment it can be honoured.
        </p>
      </AdaptiveDialog>
    </ConsolePage>
  );
}

/* A figure the chain has not paid yet. Honest by construction: there is no
   prop to pass it a number, so nothing can invent one. */
function Figure({ label }: { label: string }) {
  return (
    <Card radius="lg" pad="none" className="p-3 md:p-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </p>
      <p className="gold-text font-display tnum mt-1 text-xl font-semibold md:mt-0.5 md:text-lg">
        --
      </p>
    </Card>
  );
}
