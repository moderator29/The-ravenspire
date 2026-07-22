"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";

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
        const { data, error } = await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "forge_staking")
          .maybeSingle();
        if (!cancelled) setLive(!error && data ? Boolean(data.enabled) : false);
      } catch {
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
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="font-display text-xl font-semibold text-bone">
        The Forge
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Staking
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {/* Hero */}
        <section className="glass glass-warm relative overflow-hidden p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            <Icon name="flame" className="h-5 w-5 text-ember" />
            <span className="text-[11px] uppercase tracking-[0.26em] text-bone-faint">
              The oath of the anvil
            </span>
          </div>
          <h2 className="gold-text font-display mt-3 text-2xl font-semibold sm:text-3xl">
            Swear an oath. Earn real yield from protocol fees, not emissions.
          </h2>
          <p className="mt-3 max-w-lg text-sm text-bone-mut">
            Stake $RSP, lock it at the anvil, and take a share of what the
            realm actually earns. No printed rewards, no borrowed shine.
          </p>
          {live === null ? (
            <div className="mt-4 h-6 w-40 animate-pulse rounded-full bg-panel" />
          ) : stoking ? (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-steel-line bg-panel/70 px-3 py-1 text-xs text-ember">
              <Icon name="flame" className="h-3.5 w-3.5" />
              The Forge is being stoked
            </span>
          ) : (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-steel-line bg-panel/70 px-3 py-1 text-xs text-gold">
              <Icon name="orb" className="h-3.5 w-3.5" />
              Staking is live on-chain
            </span>
          )}
        </section>

        {/* APR */}
        <section className="glass p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
            Current APR
          </p>
          <p className="gold-text font-display tnum mt-2 text-4xl font-semibold">
            --
          </p>
          <p className="mt-2 text-xs text-bone-faint">
            The rate appears when staking goes live on-chain. It will be read
            from the contract, never promised in advance.
          </p>
        </section>

        {/* Stake */}
        <section className="glass p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Icon name="coin" className="h-4 w-4 text-gold" />
            <h2 className="font-display text-base font-semibold text-bone">
              Swear an oath
            </h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Stake
            </span>
          </div>

          <label className="mt-4 block">
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
              className="tnum mt-2 w-full rounded-2xl border border-steel-line bg-panel/70 px-4 py-3 font-mono text-lg text-bone placeholder:text-bone-faint focus:border-gold focus:outline-none disabled:opacity-60"
            />
          </label>

          <div className="mt-4">
            <span className="text-xs uppercase tracking-[0.2em] text-bone-faint">
              Lock term
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {LOCKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLock(l.id)}
                  disabled={stoking}
                  className={`tnum rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                    lock === l.id
                      ? "border-gold bg-gold/15 text-gold-bright"
                      : "border-steel-line bg-panel/70 text-bone-mut"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-bone-faint">
              Longer oaths earn a larger share of the fee pool.
            </p>
          </div>

          <button
            type="button"
            disabled={stoking || !amountValid}
            onClick={() => setShowWiring(true)}
            className="btn-gold mt-5 w-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Swear an Oath
          </button>
          {stoking ? (
            <p className="mt-2 text-xs text-bone-faint">
              Oaths open when the forge_staking flag lights. Nothing to sign
              until then.
            </p>
          ) : !amountValid && amount.trim() !== "" ? (
            <p className="mt-2 text-xs text-ember">
              Enter a positive amount of $RSP to stake.
            </p>
          ) : null}
        </section>

        {/* Position */}
        <section className="glass p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Icon name="shield" className="h-4 w-4 text-gold" />
            <h2 className="font-display text-base font-semibold text-bone">
              Your position
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-steel-line bg-panel/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Staked
              </p>
              <p className="tnum font-display mt-1 text-2xl font-semibold text-bone">
                --
              </p>
            </div>
            <div className="rounded-2xl border border-steel-line bg-panel/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Earned
              </p>
              <p className="tnum font-display mt-1 text-2xl font-semibold text-bone">
                --
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-bone-faint">
            You hold no oath yet, so there is nothing to count. Once staking is
            live these read straight from the chain.
          </p>
        </section>

        {/* Claim */}
        <section className="glass p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <Icon name="coin" className="h-4 w-4 text-gold" />
            <h2 className="font-display text-base font-semibold text-bone">
              Claim yield
            </h2>
            <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              Harvest
            </span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Claimable
              </p>
              <p className="gold-text font-display tnum mt-1 text-2xl font-semibold">
                --
              </p>
            </div>
            <button
              type="button"
              disabled={stoking}
              onClick={() => setShowWiring(true)}
              className="btn-glass shrink-0 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Claim
            </button>
          </div>
          <p className="mt-3 text-xs text-bone-faint">
            Yield accrues from protocol fees as your oath holds. The claimable
            figure reads straight from the contract once staking is live; we
            will never show a number the chain has not paid.
          </p>
        </section>
      </div>

      {showWiring && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forge-wiring-title"
          onClick={() => setShowWiring(false)}
        >
          <div
            className="glass w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <Icon name="flame" className="h-5 w-5 text-ember" />
              <h3
                id="forge-wiring-title"
                className="font-display text-lg font-semibold text-bone"
              >
                Almost at the anvil
              </h3>
            </div>
            <p className="mt-3 text-sm text-bone-mut">
              The staking flag is lit, but the on-chain contract wiring is the
              final step still being forged. No transaction will be signed and
              no coin will move until the anvil is truly hot. Your oath is
              recorded here the moment it can be honoured.
            </p>
            <button
              type="button"
              onClick={() => setShowWiring(false)}
              className="btn-gold mt-5 w-full px-5 py-2.5 text-sm font-semibold"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
