"use client";

import { useCallback, useState } from "react";
import { usePrivy, useSetWalletRecovery } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/* RECOVERY: what happens to a collection when a device is lost.
 *
 * WHAT PRIVY ACTUALLY OFFERS, WHICH IS NOT SOCIAL RECOVERY, and the copy here
 * says so because a member who believes they have guardians and does not is
 * worse off than one who knows they have a passcode.
 *
 * Read from the SDK rather than from memory. @privy-io/react-auth types the
 * recovery methods as 'privy', 'user-passcode', 'google-drive', 'icloud' and
 * 'icloud-native'. Every one of those is a BACKUP: a second copy of the
 * recovery material, held either by Privy or by the member. There are no
 * guardians, no threshold, no M-of-N, and nothing anywhere in the SDK that
 * would let a member nominate another person as a way back into their wallet.
 * Social recovery in the sense the term usually carries, a set of trusted
 * parties who can jointly restore an account, is not on offer and cannot be
 * built on top of an embedded wallet without a smart account whose contract
 * implements it. That is dark and named: see docs/RAVENSPIRE-V2.md section 50.
 *
 * SO THE PANEL SELLS EXACTLY WHAT EXISTS. The default, 'privy', means Privy
 * holds recovery material and a member who signs back in gets their wallet
 * back. That is genuinely good and it is genuinely a dependency on a company.
 * A passcode moves that dependency onto the member: nobody else can restore the
 * wallet, including Privy, and including us. Both are real positions and the
 * panel states the trade rather than recommending one, because the right answer
 * differs for somebody holding one card and somebody holding a collection.
 *
 * THE EXPORT IS THE ONLY UNCONDITIONAL ANSWER and it is why rule 6 is worth its
 * cost. A member who exports their private key can restore the wallet with no
 * help from Privy, from Ravenspire, or from anyone, forever, including after
 * both companies are gone. It sits last because it is the heaviest, and it is
 * present because a non-custodial realm that hid the exit would not be one.
 *
 * Archetype: Console. Ornament budget zero.
 */

export function RecoveryPanel() {
  const { ready, authenticated, user, exportWallet } = usePrivy();
  const { setWalletRecovery } = useSetWalletRecovery();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const wallet = user?.wallet;
  /* Only an embedded wallet has recovery to set. A member who entered by
     connecting MetaMask already holds their own key and Privy has nothing to
     back up, so the panel has nothing true to say to them. */
  const embedded =
    wallet?.walletClientType === "privy" || wallet?.walletClientType === "privy-v2";

  const method = wallet?.recoveryMethod ?? null;
  /* 'privy' is the default and means Privy holds the recovery material.
     Anything else is a backup the member set themselves. */
  const memberHeld = method !== null && method !== "privy";

  const protect = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      await setWalletRecovery();
      setNote("Set. Keep it somewhere you will still have it in a year.");
    } catch (err) {
      /* Closing the modal is the most common way this ends and is not worth
         shouting about. */
      const text = err instanceof Error ? err.message : "";
      setNote(
        /cancel|closed|reject/i.test(text)
          ? "Cancelled. Nothing changed."
          : "That could not be set just now."
      );
    } finally {
      setBusy(false);
    }
  }, [setWalletRecovery]);

  const download = useCallback(async () => {
    setNote(null);
    try {
      await exportWallet();
    } catch {
      /* Privy owns this modal end to end and a refusal there is not a realm
         error. Silence is the right answer. */
    }
  }, [exportWallet]);

  if (!ready || !authenticated || !embedded) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Recovery" hint="Getting back in from a new device" />

      <Card radius="xl" pad="md" className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5">
          <Icon
            name={memberHeld ? "shield" : "info"}
            className={`mt-0.5 h-4 w-4 shrink-0 ${memberHeld ? "text-gold" : "text-bone-faint"}`}
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-bone">
              {memberHeld
                ? "You hold your own backup"
                : "Privy holds your backup"}
            </p>
            <p className="text-xs leading-relaxed text-bone-mut">
              {memberHeld
                ? "Signing in on a new device asks you for the backup you set. Nobody can restore this wallet without it, and that includes Privy and it includes us."
                : "Signing in on a new device restores your wallet automatically, because Privy keeps recovery material for you. It is the easy option and it is a dependency on one company. Setting your own backup moves that to you."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-steel-line pt-3.5">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              dense
              variant={memberHeld ? "glass" : "gold"}
              disabled={busy}
              onClick={() => void protect()}
            >
              <Icon name="lock" className="h-3.5 w-3.5" />
              {memberHeld ? "Change your backup" : "Set your own backup"}
            </Button>
            <Button size="sm" dense variant="glass" onClick={() => void download()}>
              <Icon name="scroll" className="h-3.5 w-3.5" />
              Export the private key
            </Button>
          </div>
          {note ? <p className="text-xs text-bone-mut">{note}</p> : null}
        </div>

        {/* The correction that has to be here rather than only in a doc. Anyone
            who has used a wallet in the last few years arrives expecting
            guardians, and finding out they do not have them at the moment they
            need them is the worst possible time. */}
        <p className="text-[11px] leading-relaxed text-bone-faint">
          There are no guardians. Recovery here is a backup, not a set of trusted
          people who can vote you back in, and no wallet in the realm works that
          way today. The one answer that depends on nobody at all is the exported
          key: hold it and this wallet is yours whatever happens to Privy or to
          Ravenspire.
        </p>
      </Card>
    </section>
  );
}
