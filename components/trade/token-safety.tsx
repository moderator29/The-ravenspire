"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";

/* Real GoPlus token-security read, rendered as honest on-brand warnings before
   a member trades. Danger flags (honeypot, blacklist, cannot-sell) get an ember
   banner; softer flags a warm caution; a clean read gets a quiet pass note. We
   never imply safety we did not verify: if GoPlus cannot read the token we say
   the safety read is unavailable. */

type Severity = "danger" | "warn" | "info";
interface SafetyFlag {
  severity: Severity;
  label: string;
}
interface TokenSafety {
  flags: SafetyFlag[];
  buyTax: number | null;
  sellTax: number | null;
  holderCount: number | null;
  worst: Severity | null;
}

export function TokenSafety({
  chainId,
  address,
}: {
  chainId: number;
  address: string;
}) {
  const [state, setState] = useState<"loading" | "done" | "unavailable">(
    "loading"
  );
  const [safety, setSafety] = useState<TokenSafety | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void (async () => {
      const res = await realmFetch<{ safety?: TokenSafety | null }>(
        `/api/trade/safety?chainId=${chainId}&address=${address}`
      );
      if (cancelled) return;
      if (res.ok && res.data?.safety) {
        setSafety(res.data.safety);
        setState("done");
      } else {
        setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, address]);

  if (state === "loading") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-steel-line bg-panel/40 p-3 text-xs text-bone-faint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
        Running a GoPlus safety scan...
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint" />
        <p className="text-[11px] text-bone-mut">
          A GoPlus safety read is not available for this token right now. Absence
          of a warning is not a guarantee of safety. Trade with caution.
        </p>
      </div>
    );
  }

  if (!safety) return null;

  const danger = safety.flags.filter((f) => f.severity === "danger");
  const warn = safety.flags.filter((f) => f.severity === "warn");
  const info = safety.flags.filter((f) => f.severity === "info");

  if (safety.flags.length === 0) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-gold/25 bg-panel-warm/40 p-3">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div>
          <p className="text-xs font-semibold text-bone">
            GoPlus: no critical flags
          </p>
          <p className="mt-0.5 text-[11px] text-bone-mut">
            No honeypot, blacklist or sell-block detected
            {safety.buyTax !== null && safety.sellTax !== null
              ? `. Tax about ${safety.buyTax.toFixed(0)}% buy / ${safety.sellTax.toFixed(0)}% sell`
              : ""}
            {safety.holderCount ? `, ${safety.holderCount.toLocaleString("en-US")} holders` : ""}
            . Still unverified: do your own research.
          </p>
        </div>
      </div>
    );
  }

  const headline = danger.length > 0;
  return (
    <div
      className={`mt-3 flex items-start gap-3 rounded-2xl border p-3.5 ${
        headline
          ? "border-ember-deep/50 bg-panel"
          : "border-gold/25 bg-panel-warm/40"
      }`}
    >
      <Icon
        name="shield"
        className={`mt-0.5 h-4 w-4 shrink-0 ${headline ? "text-ember" : "text-gold"}`}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-bone">
          GoPlus flagged {safety.flags.length}{" "}
          {safety.flags.length === 1 ? "risk" : "risks"} on this token
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {[...danger, ...warn, ...info].map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px]">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  f.severity === "danger"
                    ? "bg-ember"
                    : f.severity === "warn"
                      ? "bg-gold"
                      : "bg-bone-faint"
                }`}
              />
              <span
                className={
                  f.severity === "danger" ? "text-bone" : "text-bone-mut"
                }
              >
                {f.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-bone-faint">
          Source: GoPlus Security. Signals can be incomplete. Never trade more
          than you can lose.
        </p>
      </div>
    </div>
  );
}
