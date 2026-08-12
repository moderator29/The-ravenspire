"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";

/* "Top up with card": opens a real MoonPay on-ramp for the native gas / quote
   token, delivered straight to the member's own wallet (non-custodial). The
   signed URL is built server-side; when MoonPay is not configured the button
   says so honestly instead of opening a dead widget. */
export function TopUpButton({
  chainId,
  walletAddress,
  amountUsd,
}: {
  chainId: number;
  walletAddress: string;
  amountUsd?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      chainId: String(chainId),
      walletAddress,
    });
    if (amountUsd && amountUsd > 0) qs.set("amountUsd", String(Math.round(amountUsd)));
    const res = await realmFetch<{ url?: string; error?: string }>(
      `/api/trade/onramp?${qs.toString()}`
    );
    setLoading(false);
    if (res.ok && res.data?.url) {
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } else {
      setError(res.data?.error ?? "Card top-up is not available right now.");
    }
  };

  return (
    <div>
      <Button
        variant="gold"
        size="lg"
        block
        loading={loading}
        onClick={() => void open()}
      >
        {!loading && <Icon name="wallet" className="h-4 w-4" />}
        Top up with card
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-state-warning">
          {error}
        </p>
      )}
    </div>
  );
}
