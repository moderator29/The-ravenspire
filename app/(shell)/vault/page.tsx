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

/* The Vault: a Console. Compact above md, zero ornament, and every panel
   inside it on the shared Card chassis. */

export default function VaultPage() {
  const { ready, enabled, authenticated, signInX, signInEmail } =
    useRealmAuth();

  const showSkeleton = useDelayedLoading(!ready, 300);

  return (
    <ConsolePage width="data">
      <ConsoleHeader title="The Vault" kicker="Non-custodial, keys and coin" />

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
          <WalletSection />
        )}
      </div>
    </ConsolePage>
  );
}
