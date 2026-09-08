"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Card, CardRow } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { realmFetch } from "@/lib/auth/api";
import { isWatched, subscribe } from "@/components/coin/watchlist";

interface Props {
  /** EIP-155 chain id the coin lives on, matching WatchStar's own prop. */
  chainId: number;
  address: string;
  /** Ticker, used only in toast copy. */
  symbol?: string;
  className?: string;
}

/* Presets rather than a free-text field, matching this codebase's existing
   preference (see SLIPPAGE_PRESETS_BPS / USD_PRESETS in trade-panel.tsx): a
   member picks a segment, never types a number that might land outside the
   armed range and bounce off a 400. */
const ALERT_PRESETS = [5, 10, 20, 30];

interface WatchlistItem {
  chainId: number;
  address: string;
  alertPct: number | null;
  alertBaselinePrice: number | null;
}

function fmtPrice(n: number): string {
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
}

/*
  Arm or disarm a percent-move alert on a coin the member has already
  starred: "notify me if this moves plus or minus X% from where it is now."
  Renders nothing until the coin is actually watched, since an alert on a
  coin that is not starred is not a state the product offers anywhere else.

  Ledger register throughout (rule 21): a dense CardRow, no glow, no motion
  beyond the SegmentedControl's own, matching every other row on this page.
*/
export function AlertControl({ chainId, address, symbol, className = "" }: Props) {
  const watched = useSyncExternalStore(
    subscribe,
    () => isWatched(chainId, address),
    () => false
  );
  const toast = useToast();

  const [armedPct, setArmedPct] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Hydrate from the same watchlist read the star's own store already makes
     server side (see GET /api/watchlist), rather than a dedicated endpoint
     for one row's alert state. */
  useEffect(() => {
    if (!watched) {
      setLoaded(false);
      return;
    }
    let alive = true;
    void realmFetch<{ items: WatchlistItem[] }>("/api/watchlist").then((res) => {
      if (!alive) return;
      if (res.ok && res.data) {
        const row = res.data.items.find(
          (it) =>
            it.chainId === chainId &&
            it.address.toLowerCase() === address.toLowerCase()
        );
        setArmedPct(row?.alertPct ?? null);
        setBaseline(row?.alertBaselinePrice ?? null);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [watched, chainId, address]);

  if (!watched) return null;

  const setPreset = async (value: string) => {
    if (saving) return;
    const next = value === "off" ? null : Number(value);
    setSaving(true);
    const res = await realmFetch<{
      alertPct?: number;
      alertBaselinePrice?: number;
      error?: string;
    }>("/api/watchlist", {
      method: "POST",
      json: { chainId, address, alertPct: next },
    });
    setSaving(false);

    if (!res.ok) {
      toast.error({
        title: "Could not update this alert",
        description: res.data?.error ?? "Try again shortly.",
      });
      return;
    }

    setArmedPct(next);
    setBaseline(next === null ? null : (res.data?.alertBaselinePrice ?? null));
    if (next === null) {
      toast.info({ title: `Alert off for ${symbol ?? "this coin"}` });
    } else {
      toast.success({
        title: `Alert armed at ±${next}%`,
        description:
          res.data?.alertBaselinePrice != null
            ? `Notifies from $${fmtPrice(res.data.alertBaselinePrice)}`
            : undefined,
      });
    }
  };

  const desc =
    armedPct === null
      ? "Get a raven when this coin moves"
      : baseline !== null
        ? `Notifies on a ±${armedPct}% move from $${fmtPrice(baseline)}`
        : `Notifies on a ±${armedPct}% move`;

  return (
    <Card pad="md" className={className}>
      <CardRow title="Price alert" desc={desc}>
        <SegmentedControl
          label="Price alert threshold"
          size="sm"
          value={armedPct === null ? "off" : String(armedPct)}
          onValueChange={(v) => void setPreset(v)}
          className={!loaded || saving ? "opacity-60" : undefined}
          items={[
            { value: "off", label: "Off" },
            ...ALERT_PRESETS.map((p) => ({ value: String(p), label: `${p}%` })),
          ]}
        />
      </CardRow>
    </Card>
  );
}
