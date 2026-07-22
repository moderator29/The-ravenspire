"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import type { CustomToken } from "@/components/wallet/wallet-prefs";
import { evmChainById } from "@/components/wallet/chains";

interface BalancesResponse {
  configured: boolean;
  tokens?: WalletToken[];
  totalUsd?: number;
  error?: string;
}

export interface WalletTokensState {
  tokens: WalletToken[];
  totalUsd: number;
  loading: boolean;
  configured: boolean;
  error: string | null;
  refresh: () => void;
}

/* Fetches the member's live multi-chain balances from the read-only balances
   route (Covalent/GoldRush) and folds in any custom tokens they added by
   contract address. Custom tokens the provider already returned (because they
   are held) keep their real balance; ones not returned surface at a true zero
   so the list never invents a holding. */
export function useWalletTokens(
  address: string | undefined,
  custom: CustomToken[]
): WalletTokensState {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!address) {
      setTokens([]);
      setTotalUsd(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/wallet/balances?address=${address}`,
          { cache: "no-store" }
        );
        const body = (await res.json()) as BalancesResponse;
        if (cancelled) return;
        setConfigured(body.configured);
        if (!res.ok || body.error) {
          setError(body.error ?? "unreachable");
          setTokens([]);
          setTotalUsd(0);
        } else {
          setTokens(body.tokens ?? []);
          setTotalUsd(body.totalUsd ?? 0);
        }
      } catch {
        if (cancelled) return;
        setError("unreachable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, nonce]);

  // Fold custom tokens in as real rows; a held one is already present, so we
  // only add the ones the provider did not return, at a true zero balance.
  const merged = mergeCustom(tokens, custom);

  return { tokens: merged, totalUsd, loading, configured, error, refresh };
}

function mergeCustom(
  tokens: WalletToken[],
  custom: CustomToken[]
): WalletToken[] {
  if (!custom.length) return tokens;
  const present = new Set(tokens.map((t) => t.key));
  const extra: WalletToken[] = [];
  for (const c of custom) {
    const key = `${c.chainId}:${c.contract.toLowerCase()}`;
    if (present.has(key)) continue;
    const chain = evmChainById(c.chainId);
    extra.push({
      key,
      chainId: c.chainId,
      chainName: chain?.name ?? `Chain ${c.chainId}`,
      chainShort: chain?.short ?? "EVM",
      symbol: c.symbol,
      name: c.name,
      contract: c.contract,
      isNative: false,
      decimals: c.decimals,
      balanceRaw: "0",
      balanceDisplay: "0",
      quoteUsd: 0,
      priceUsd: 0,
      change24h: 0,
      logo: null,
    });
  }
  return [...tokens, ...extra];
}
