"use client";

import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  ConsoleHeader,
  ConsolePage,
} from "@/components/console/console-shell";
import { WalletSection } from "@/components/wallet/wallet-section";
import { VaultLockGate } from "@/components/wallet/vault-lock-gate";
import { HoardPanel } from "@/components/collectibles/hoard-panel";
import { OrdersPanel } from "@/components/commerce/orders-panel";
import { SpendLimitsPanel } from "@/components/commerce/spend-limits-panel";
import { GasPanel } from "@/components/wallet/gas-panel";
import { SigningLimitPanel } from "@/components/wallet/signing-limit-panel";

/* The Vault: a Console. Compact above md, zero ornament, and every panel
   inside it on the shared Card chassis. */

export default function VaultPage() {
  const { ready, enabled, authenticated, address, signInX, signInEmail } =
    useRealmAuth();

  const showSkeleton = useDelayedLoading(!ready, 300);

  return (
    <ConsolePage width="data">
      {/* The Vault is an account anchor with no deeper parent, so its cold
          entry destination is the feed, stated rather than inherited. */}
      <ConsoleHeader
        title="The Vault"
        kicker="Non-custodial, keys and coin"
        backHref="/home"
      />

      <div className="mt-4 md:mt-3">
        {!ready ? (
          showSkeleton ? (
            <div className="flex flex-col gap-4 md:gap-3">
              <Skeleton radius="xl" className="h-40 md:h-32" />
              <Skeleton radius="xl" className="h-20 md:h-16" />
              <Skeleton radius="xl" className="h-28 md:h-24" />
            </div>
          ) : null
        ) : !authenticated ? (
          <Card pad="none">
            <EmptyState
              icon3d="vault"
              title="The Vault awaits its keeper"
              body="Enter the realm and a non-custodial wallet is forged for you on the spot. Your keys, your coin, your vault. No one else holds a copy."
              action={
                enabled ? (
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <Button variant="gold" size="lg" onClick={signInX}>
                      <Icon name="xlogo" className="h-4 w-4" />
                      Enter with X
                    </Button>
                    <Button size="lg" onClick={signInEmail}>
                      <Icon name="mail" className="h-4 w-4" />
                      Enter with email
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-bone-faint">
                    The Gatehouse is not mounted in this environment, so sign-in
                    is resting.{" "}
                    <Link href="/signin" className="text-gold underline">
                      The gate
                    </Link>{" "}
                    will open once it is.
                  </p>
                )
              }
            />
          </Card>
        ) : (
          /* The passcode lock, when a member has set one, gates everything
             below: balances, sends, the Hoard, all of it. Redeeming a printed
             code and recovery moved into the Vault's own Settings sheet (the
             gear on the balance card), so what used to sit here is now one
             tap away rather than a permanent fixture on the scroll. */
          <VaultLockGate address={address}>
            <WalletSection />

            {/* The collectibles half of the Vault. A wallet holds coin and it
                holds collectibles, and until now this Console only knew about
                one of them. It sits below the coin because that is the order a
                member reaches for them, and it carries the claim controls
                because the Vault is where a member goes to move what is
                theirs. On the Keep the same case is a trophy; here it is an
                instrument. */}
            <section className="mt-4 flex flex-col gap-3 md:mt-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-bone">
                  The Hoard
                </h2>
                <Link
                  href="/reliquary"
                  className="text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
                >
                  The Reliquary
                </Link>
              </div>
              <HoardPanel handle={null} own />

              {/* What the realm owes. Orders are absent for a member who has
                  never bought anything. */}
              <OrdersPanel />
              {/* What has been charged, against the limits that will actually
                  stop it, and the control for holding yourself to less. Absent
                  entirely for a member who has never spent and set no limit,
                  because telling somebody who has bought nothing how much
                  headroom they have is an invitation dressed as information. */}
              <SpendLimitsPanel />

              {/* The cost of being non-custodial, ahead of the settings that
                  answer for it. Gas is the one a member meets on their very
                  first act; the signing ceiling is the advanced one, kept
                  deliberately far from the spending limit above so the two
                  different features never invite the confusion both of them
                  warn about. Each panel renders nothing at all when it has
                  nothing true to say. */}
              <GasPanel />
              <SigningLimitPanel />
            </section>
          </VaultLockGate>
        )}
      </div>
    </ConsolePage>
  );
}
