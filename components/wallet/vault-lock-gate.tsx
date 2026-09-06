"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { PasscodePad } from "@/components/wallet/passcode-pad";
import { useVaultLock } from "@/components/wallet/vault-lock";

type Stage = "intro" | "create" | "confirm";

/* Gates the Vault's real content behind a local 6-digit passcode.

   THIS IS NOT CUSTODY. Privy already decided who is allowed to sign in, and
   the embedded wallet's real protection is its own; this gate exists so a
   phone left unlocked on the Ravenry does not leave a member's balances and
   send controls sitting open on the same screen a stranger could pick up.
   That is also why a forgotten passcode resets rather than traps: see
   useVaultLock's `reset`.

   A brand new member sees a welcome step before the passcode ask, because
   asking someone to protect a wallet they have not even seen yet is asking
   for a number nobody will remember. Skipping is one tap away and honest:
   the Vault works with no passcode set, same as it always did, and Settings
   can turn one on whenever a member decides they want it. */
export function VaultLockGate({
  address,
  children,
}: {
  address?: string;
  children: ReactNode;
}) {
  const lock = useVaultLock(address);
  const [stage, setStage] = useState<Stage>("intro");
  const [firstPin, setFirstPin] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [shake, setShake] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (message: string) => {
    setError(message);
    setShake(true);
    setAttempt((a) => a + 1);
    window.setTimeout(() => setShake(false), 300);
  };

  /* One tick of localStorage not having answered yet. Nothing renders rather
     than flashing a welcome or a lock screen that the next tick replaces. */
  if (lock.status === "checking") return null;

  if (lock.status === "welcome") {
    if (stage === "intro") {
      return (
        <Screen icon3d="vault" title="Welcome to the Vault">
          <p className="max-w-[38ch] text-sm text-bone-mut">
            Your non-custodial wallet is forged and ready. Set a 6-digit
            passcode so only you can open the Vault on this device.
          </p>
          <div className="mt-1 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="gold" size="lg" onClick={() => setStage("create")}>
              <Icon name="lock" className="h-4 w-4" />
              Set up a passcode
            </Button>
            <Button size="lg" onClick={() => lock.skipSetup()}>
              Skip for now
            </Button>
          </div>
        </Screen>
      );
    }

    if (stage === "create") {
      return (
        <Screen icon="lock" title="Create your passcode">
          <p className="text-sm text-bone-mut">Choose 6 digits.</p>
          <PasscodePad
            key="create"
            onComplete={(pin) => {
              setFirstPin(pin);
              setError(null);
              setStage("confirm");
            }}
          />
          <button
            type="button"
            onClick={() => setStage("intro")}
            className="touch:min-h-11 touch:min-w-11 text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
          >
            Cancel
          </button>
        </Screen>
      );
    }

    return (
      <Screen icon="lock" title="Confirm your passcode">
        <p className="text-sm text-bone-mut">Enter it once more.</p>
        <PasscodePad
          key={`confirm-${attempt}`}
          shake={shake}
          onComplete={(pin) => {
            if (pin === firstPin) {
              void lock.setup(pin);
            } else {
              fail("That did not match. Try again.");
            }
          }}
        />
        {error ? <p className="text-xs text-state-danger">{error}</p> : null}
        <button
          type="button"
          onClick={() => {
            setFirstPin("");
            setError(null);
            setStage("create");
          }}
          className="touch:min-h-11 touch:min-w-11 text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
        >
          Start over
        </button>
      </Screen>
    );
  }

  if (lock.status === "locked") {
    return (
      <Screen icon="lock" title="Enter your passcode">
        <p className="text-sm text-bone-mut">The Vault is locked.</p>
        <PasscodePad
          key={attempt}
          shake={shake}
          onComplete={(pin) => {
            void lock.verify(pin).then((ok) => {
              if (!ok) fail("That passcode is not correct.");
            });
          }}
        />
        {error ? <p className="text-xs text-state-danger">{error}</p> : null}
        <button
          type="button"
          onClick={() => lock.reset()}
          className="touch:min-h-11 touch:min-w-11 text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
        >
          Forgot your passcode?
        </button>
      </Screen>
    );
  }

  return <>{children}</>;
}

function Screen({
  icon,
  icon3d,
  title,
  children,
}: {
  icon?: string;
  icon3d?: Icon3DName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card
      pad="hero"
      render={<section />}
      className="flex flex-col items-center gap-4 text-center"
    >
      {icon3d ? (
        <Icon3D name={icon3d} size="lg" />
      ) : icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-gold/30 bg-panel">
          <Icon name={icon} className="h-5 w-5 text-gold" />
        </span>
      ) : null}
      <p className="font-display text-lg font-semibold text-bone">{title}</p>
      {children}
    </Card>
  );
}
