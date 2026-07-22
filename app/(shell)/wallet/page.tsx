"use client";

import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";
import { WalletSection } from "@/components/wallet/wallet-section";

export default function WalletPage() {
  const { ready, enabled, authenticated, signInX, signInEmail } =
    useRealmAuth();

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
          <Icon name="wallet" className="h-5 w-5 text-gold" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-bone">
            Your Wallet
          </h1>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.26em] text-bone-faint">
            Non-custodial, keys and coin
          </p>
        </div>
      </div>

      <div className="mt-5">
        {!ready ? (
          <div className="flex flex-col gap-4">
            <div className="glass h-52 animate-pulse" />
            <div className="glass h-28 animate-pulse" />
            <div className="glass h-32 animate-pulse" />
          </div>
        ) : !authenticated ? (
          <div className="glass relative overflow-hidden p-8 text-center sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-steel-line bg-panel">
              <Icon name="wallet" className="h-6 w-6 text-gold" />
            </div>
            <h2 className="gold-text font-display mt-5 text-2xl font-semibold">
              A wallet awaits its keeper
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-bone-mut">
              Enter the realm and a non-custodial wallet is forged for you on
              the spot. Your keys, your coin. No one else holds a copy.
            </p>
            {enabled ? (
              <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={signInX}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-sm"
                >
                  <Icon name="xlogo" className="h-4 w-4" />
                  Enter with X
                </button>
                <button
                  type="button"
                  onClick={signInEmail}
                  className="btn-glass inline-flex items-center gap-2 px-5 py-2.5 text-sm"
                >
                  <Icon name="mail" className="h-4 w-4" />
                  Enter with email
                </button>
              </div>
            ) : (
              <p className="mt-6 text-xs text-bone-faint">
                The Gatehouse is not mounted in this environment, so sign-in is
                resting. <Link href="/settings" className="text-gold underline">Settings</Link>{" "}
                will show it once it is.
              </p>
            )}
          </div>
        ) : (
          <WalletSection />
        )}
      </div>
    </div>
  );
}
