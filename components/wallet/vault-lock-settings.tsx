"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PasscodePad } from "@/components/wallet/passcode-pad";
import { useVaultLock } from "@/components/wallet/vault-lock";

type Stage = "idle" | "create" | "confirm";

/* The Vault's passcode lock, surfaced as a settings row rather than the
   dedicated full screen components/wallet/vault-lock-gate.tsx uses at the
   Vault's front door: a member reaching this row is already inside, so there
   is no welcome step and no "skip for now" here, only on, off and change. */
export function VaultLockSettings({ address }: { address?: string }) {
  const lock = useVaultLock(address);
  const [stage, setStage] = useState<Stage>("idle");
  const [firstPin, setFirstPin] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [shake, setShake] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fail = (message: string) => {
    setNote(message);
    setShake(true);
    setAttempt((a) => a + 1);
    window.setTimeout(() => setShake(false), 300);
  };

  const startCreate = () => {
    setNote(null);
    setFirstPin("");
    setStage("create");
  };

  if (lock.status === "checking") return null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        Passcode lock
      </p>

      {stage === "idle" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel">
              <Icon name="lock" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-sm font-medium text-bone">
                {lock.hasPasscode ? "On" : "Off"}
              </p>
              <p className="text-xs text-bone-faint">
                {lock.hasPasscode
                  ? "A 6-digit passcode guards the Vault on this device."
                  : "Anyone with this device can open the Vault."}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {lock.hasPasscode ? (
              <>
                <Button size="sm" dense variant="glass" onClick={startCreate}>
                  Change
                </Button>
                <Button
                  size="sm"
                  dense
                  variant="glass"
                  onClick={() => lock.removePasscode()}
                >
                  Turn off
                </Button>
              </>
            ) : (
              <Button size="sm" dense variant="gold" onClick={startCreate}>
                Turn on
              </Button>
            )}
          </div>
        </div>
      ) : stage === "create" ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-steel-line bg-panel/40 p-4">
          <p className="text-sm text-bone-mut">Choose 6 digits.</p>
          <PasscodePad
            key="settings-create"
            onComplete={(pin) => {
              setFirstPin(pin);
              setNote(null);
              setStage("confirm");
            }}
          />
          <button
            type="button"
            onClick={() => setStage("idle")}
            className="text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-steel-line bg-panel/40 p-4">
          <p className="text-sm text-bone-mut">Enter it once more.</p>
          <PasscodePad
            key={`settings-confirm-${attempt}`}
            shake={shake}
            onComplete={(pin) => {
              if (pin === firstPin) {
                void lock.setup(pin).then(() => setStage("idle"));
              } else {
                fail("That did not match. Try again.");
              }
            }}
          />
          {note ? <p className="text-xs text-state-danger">{note}</p> : null}
          <button
            type="button"
            onClick={() => {
              setFirstPin("");
              setNote(null);
              setStage("create");
            }}
            className="text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
          >
            Start over
          </button>
        </div>
      )}
    </section>
  );
}
