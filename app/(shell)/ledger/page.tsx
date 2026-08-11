"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import {
  ConsoleHeader,
  ConsolePage,
  ConsoleStack,
} from "@/components/console/console-shell";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import { buildPortfolio } from "@/components/ledger/portfolio-data";
import { ValueHeader } from "@/components/ledger/value-header";
import { TrendCard } from "@/components/ledger/trend-card";
import { Allocation } from "@/components/ledger/allocation";
import { Positions } from "@/components/ledger/positions";

interface BalancesResponse {
  configured: boolean;
  tokens?: WalletToken[];
  totalUsd?: number;
  error?: string;
}

/* The Ledger's panels are all skeleton-shaped the same way: a value band and
   a positions table. One shape, so a slow read never rearranges the page. */
function LedgerSkeleton() {
  return (
    <>
      <Skeleton radius="xl" className="h-32 md:h-28" />
      <Skeleton radius="xl" className="h-48 md:h-40" />
    </>
  );
}

export default function LedgerPage() {
  const { ready, authenticated, address } = useRealmAuth();
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    /* Owner-only: we only ever read the signed-in member's own embedded
       wallet address. No other member's balances are ever requested here. */
    if (!address) return;
    setRefreshing(true);
    setFailed(false);
    try {
      const res = await realmFetch<BalancesResponse>(
        `/api/wallet/balances?address=${encodeURIComponent(address)}`
      );
      if (!res.data) throw new Error("unreachable");
      setData(res.data);
      setUpdatedAt(Date.now());
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    void load();
  }, [ready, authenticated, address, load]);

  const portfolio = useMemo(
    () => (data?.tokens ? buildPortfolio(data.tokens) : null),
    [data]
  );

  const loading = !ready || (authenticated && !!address && data === null && !failed);
  const showSkeleton = useDelayedLoading(loading, 300);

  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Ledger"
        kicker="The Ravenspire portfolio / $RSP and beyond"
        actions={
          <>
            {authenticated && address && (
              <Button
                size="sm"
                disabled={refreshing}
                loading={refreshing}
                onClick={() => void load()}
              >
                {refreshing ? "Reading" : "Refresh"}
              </Button>
            )}
            <Button
              size="sm"
              render={
                <Link href="/vault">
                  <Icon name="wallet" className="h-3.5 w-3.5" />
                  Open the Vault
                </Link>
              }
            />
          </>
        }
      />
      <ConsoleStack className="mt-4 md:mt-3">
        {!ready ? (
          showSkeleton ? <LedgerSkeleton /> : null
        ) : !authenticated ? (
          <Card pad="none">
            <EmptyState
              icon="ledger"
              title="Your Ledger is sealed"
              body="The Ledger reads only your own wallet. Enter the realm to bind yours."
              action={
                <Button
                  variant="gold"
                  size="sm"
                  render={<Link href="/signin">Enter the realm</Link>}
                />
              }
            />
          </Card>
        ) : !address ? (
          <Card pad="none">
            <EmptyState
              icon="wallet"
              title="No wallet bound"
              body="No wallet is connected to your banner yet. Open the Vault to create or connect one, and your Ledger will fill in from your real balances."
              action={
                <Button
                  variant="gold"
                  size="sm"
                  render={<Link href="/vault">Connect in the Vault</Link>}
                />
              }
            />
          </Card>
        ) : failed ? (
          <Card pad="none">
            <EmptyState
              icon="alert"
              title="The Ledger could not be read"
              body="Nothing was returned just now."
              action={
                <Button size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : data === null ? (
          showSkeleton ? <LedgerSkeleton /> : null
        ) : !data.configured ? (
          <Card pad="none">
            <EmptyState
              icon="eye"
              title="Lens not mounted"
              body="The Ledger's far-seeing lens is not mounted in this environment yet, so no balances can be read."
            />
          </Card>
        ) : data.error ? (
          <Card pad="none">
            <EmptyState
              icon="alert"
              title="The lens clouded over"
              body="The Ledger could not be read just now."
              action={
                <Button size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          </Card>
        ) : !portfolio ||
          (portfolio.positions.length === 0 && portfolio.dust.length === 0) ? (
          <Card pad="none">
            <EmptyState
              icon="coin"
              title="Nothing held yet"
              body="This wallet holds no coin worth an entry across the chains we read. The Ledger awaits your first treasure."
            />
          </Card>
        ) : (
          <>
            <ValueHeader portfolio={portfolio} />
            {address && <TrendCard address={address} />}
            {portfolio.byAsset.length > 0 && (
              <Allocation
                byAsset={portfolio.byAsset}
                byChain={portfolio.byChain}
              />
            )}
            <Positions
              positions={portfolio.positions}
              dust={portfolio.dust}
            />
            {updatedAt && (
              <p className="text-center text-[11px] text-bone-faint">
                Read{" "}
                <span className="tnum">
                  {new Date(updatedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                . Values from live on-chain balances across seven EVM chains.
              </p>
            )}
          </>
        )}
      </ConsoleStack>
    </ConsolePage>
  );
}
