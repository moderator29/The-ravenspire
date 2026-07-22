"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      {children}
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass p-8 text-center text-sm leading-relaxed text-bone-mut">
      {children}
    </div>
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
      const res = await fetch(
        `/api/wallet/balances?address=${encodeURIComponent(address)}`
      );
      const body = (await res.json()) as BalancesResponse;
      setData(body);
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

  const header = (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackButton />
        <Link
          href="/vault"
          className="btn-glass px-3.5 py-1.5 text-xs font-semibold text-bone-mut hover:text-bone"
        >
          <Icon name="wallet" className="h-3.5 w-3.5" />
          Open the Vault
        </Link>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-bone">
            The Ledger
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-bone-faint">
            The Ravenspire portfolio / $RSP and beyond
          </p>
        </div>
        {authenticated && address && (
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="btn-glass shrink-0"
          >
            {refreshing ? "Reading" : "Refresh"}
          </button>
        )}
      </div>
    </>
  );

  return (
    <Shell>
      {header}
      <div className="mt-5 flex flex-col gap-3">
        {!ready ? (
          <>
            <div className="glass h-40 animate-pulse" />
            <div className="glass h-56 animate-pulse" />
          </>
        ) : !authenticated ? (
          <EmptyCard>
            <p className="mb-3">
              Your Ledger reads only your own wallet. Enter the realm to bind
              yours.
            </p>
            <Link href="/signin" className="text-gold underline">
              Enter the realm
            </Link>
          </EmptyCard>
        ) : !address ? (
          <EmptyCard>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
              <Icon name="wallet" className="h-5 w-5 text-gold" />
            </div>
            <p className="mb-3">
              No wallet is connected to your banner yet. Open the Vault to
              create or connect one, and your Ledger will fill in from your real
              balances.
            </p>
            <Link href="/vault" className="text-gold underline">
              Connect your wallet in the Vault
            </Link>
          </EmptyCard>
        ) : failed ? (
          <EmptyCard>
            The Ledger could not be read just now.
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 block w-full text-gold underline"
            >
              Try again
            </button>
          </EmptyCard>
        ) : data === null ? (
          <>
            <div className="glass h-40 animate-pulse" />
            <div className="glass h-56 animate-pulse" />
          </>
        ) : !data.configured ? (
          <EmptyCard>
            The Ledger&apos;s far-seeing lens is not mounted in this environment
            yet, so no balances can be read.
          </EmptyCard>
        ) : data.error ? (
          <EmptyCard>
            The Ledger&apos;s lens clouded over.
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 block w-full text-gold underline"
            >
              Try again
            </button>
          </EmptyCard>
        ) : !portfolio ||
          (portfolio.positions.length === 0 && portfolio.dust.length === 0) ? (
          <EmptyCard>
            This wallet holds no coin worth an entry yet across the chains we
            read. The Ledger awaits your first treasure.
          </EmptyCard>
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
                {new Date(updatedAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                . Values from live on-chain balances across seven EVM chains.
              </p>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
