"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  forgetWalletGuardrails,
  readWalletGuardrails,
  type GuardrailsRead,
} from "@/components/wallet/wallet-guardrails-actions";

/* Who pays the gas, composed from the two halves that each know only part of it.
 *
 * THE DIVISION, WHICH IS FORCED BY THE SDK AND NOT A DESIGN PREFERENCE.
 * Privy resolves a smart wallet's bundler and paymaster from configuration held
 * in its own dashboard and delivers them to the browser inside the app config.
 * No server-side check can see any of that. So:
 *
 *   THE SERVER knows whether sponsorship is PERMITTED: the gasless_live flag,
 *   an attested chain, and budget left on both the member's and the realm's
 *   allowance. It answers on /api/wallet/guardrails.
 *
 *   THE BROWSER knows whether sponsorship is POSSIBLE: whether Privy actually
 *   created a smart account for this member, which it does only when the
 *   dashboard has smart wallets enabled. `user.smartWallet` is the observation.
 *
 * A surface may say "the realm covers this" only when both say yes.
 *
 * THE CASE THIS HOOK EXISTS FOR is the third one: permitted but not possible.
 * The flag is up, the budget is there, and the member has no smart account
 * because the dashboard was never finished. Reading the server's answer alone
 * would put "no gas needed" on the screen and then charge them gas, which is
 * the precise thing this mission forbids. So that case returns payer "you" with
 * a reason that says the realm would have covered it, and the member is never
 * surprised at the wallet prompt.
 *
 * NOTHING HERE EVER BLOCKS AN ACTION. `payer` is a label, not a gate. A member
 * can always act, paying their own gas, which is what happens today and has
 * always worked. A dead button would be a worse outcome than an unsponsored one.
 *
 * WHY THIS DOES NOT IMPORT THE SMART WALLET CLIENT. Sending a sponsored user
 * operation needs `@privy-io/react-auth/smart-wallets`, whose types import
 * `permissionless`, an optional peer dependency this project does not install.
 * Adding it would put a bundle's worth of code behind a feature that cannot
 * work until the dashboard exists. `user.smartWallet` gives the observation with
 * no dependency at all, so the honest label ships now and the routing waits on
 * the one thing it genuinely waits on. See docs/RAVENSPIRE-V2.md section 50.
 */

export type Payer = "realm" | "you";

export type Sponsorship = {
  /* False until both halves have answered. A surface must not render a payer
     while this is false: flashing "the realm pays" and correcting it a moment
     later is worse than saying nothing for that moment. */
  ready: boolean;
  payer: Payer;
  /* Why the member pays, when they do. Null when the realm does. */
  reason: string | null;
  /* The smart account address, when there is one. Rendered nowhere by default;
     available for a surface that needs to show a member where a sponsored act
     would land, which is a different address from their embedded wallet. */
  smartWalletAddress: string | null;
  refresh: () => void;
};

export function useSponsorship(): Sponsorship {
  const { ready: privyReady, authenticated, user } = usePrivy();
  const [read, setRead] = useState<GuardrailsRead | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!authenticated) {
      setRead(null);
      setLoaded(true);
      return;
    }
    const next = await readWalletGuardrails();
    setRead(next);
    setLoaded(true);
  }, [authenticated]);

  useEffect(() => {
    if (!privyReady) return;
    void load();
  }, [privyReady, load]);

  const smartWalletAddress = user?.smartWallet?.address ?? null;
  const ready = privyReady && loaded;

  /* Fail toward "you pay". Every path that is not an explicit yes from both
     halves lands here, including an unreachable route and a signed-out caller,
     because the cost of wrongly saying the member pays is a pleasant surprise
     and the cost of wrongly saying the realm pays is a broken promise about
     money. */
  let payer: Payer = "you";
  let reason: string | null = null;

  if (!read) {
    reason = null;
  } else if (!read.sponsorship.permitted) {
    reason = read.sponsorship.sentence;
  } else if (!smartWalletAddress) {
    /* Permitted but not possible. Named precisely rather than folded into the
       generic case, because this one is an operator's unfinished configuration
       and not a member's spent allowance, and somebody reading a support
       message needs to be able to tell those apart. */
    reason =
      "The realm would cover this, but your wallet has no smart account yet. You pay your own gas.";
  } else {
    payer = "realm";
  }

  return {
    ready,
    payer,
    reason,
    smartWalletAddress,
    refresh: () => {
      forgetWalletGuardrails();
      void load();
    },
  };
}
