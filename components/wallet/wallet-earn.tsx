"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";

interface RefData {
  code: string | null;
  activated: number;
  pending: number;
  total: number;
}

/* Earn: reads the caller's referral banner from /api/referrals and frames the
   real earnings honestly. Shows the shareable link (copy), how many recruits
   have activated, and how rewards accrue. No invented balances; $RSP framing
   only, credited later at Season claims. Rendered as the body of the Earn
   modal. */
export function WalletEarn() {
  const [data, setData] = useState<RefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await realmFetch<RefData>("/api/referrals");
      if (cancelled) return;
      if (res.ok && res.data) setData(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const code = data?.code ?? null;
  const link = code && origin ? `${origin}/?ref=${code}` : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="glass-sm h-20 animate-pulse rounded-2xl" />
        <div className="glass-sm h-24 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bone-mut">
        Invite others to the realm and earn as they arrive. Rewards flow from
        real activity, so a recruit counts once they truly show up, not merely
        at signup.
      </p>

      {/* Live standings */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={data?.activated ?? 0} label="Raised" accent />
        <Stat value={data?.pending ?? 0} label="Pending" />
        <Stat value={data?.total ?? 0} label="Sent" />
      </div>

      {/* Referral link */}
      {link ? (
        <div className="rounded-2xl border border-gold/20 bg-panel-warm/50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            Your referral link
          </p>
          <div className="mt-2.5 flex flex-col gap-2.5">
            <code className="glass-sm min-w-0 overflow-x-auto whitespace-nowrap rounded-lg border border-steel-line bg-void px-3 py-2.5 text-xs text-gold-bright">
              {link}
            </code>
            <CopyButton
              value={link}
              label="Copy link"
              className="btn-gold inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-steel-line bg-panel/40 p-3.5">
          <p className="text-sm text-bone-mut">
            Claim your handle first; your referral link carries your name.
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-bone-faint">
        <Icon name="crown" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        Points and Renown are credited as your recruits act. $RSP comes later,
        at Season claims, non-custodial and claimed by you alone. We will not
        show you a number that does not exist yet.
      </p>
    </div>
  );
}

function Stat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-steel-line bg-void px-3 py-3 text-center">
      <p
        className={`tnum font-display text-2xl font-semibold ${
          accent ? "text-gold-bright" : "text-bone"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-bone-faint">
        {label}
      </p>
    </div>
  );
}
