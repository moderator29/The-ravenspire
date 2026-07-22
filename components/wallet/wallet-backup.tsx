"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Icon } from "@/components/ui/icon";

/* Backup / Export. Uses Privy's exportWallet, which reveals the private key or
   recovery phrase inside a secure, on-device window. The key never touches
   The Ravenspire's servers. Rendered as the body of the Backup modal; MUST render
   only when Privy is enabled so usePrivy has its provider above it. */
export function WalletBackup() {
  const { exportWallet } = usePrivy();
  const [failed, setFailed] = useState(false);

  const onExport = async () => {
    setFailed(false);
    try {
      await exportWallet();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-bone-mut">
        Reveal your private key to back this wallet up or carry it to another
        keep. The reveal happens entirely on this device, inside a secure Privy
        window. It is never sent to our servers, and we could not read it if we
        tried.
      </p>

      <div className="flex items-start gap-3 rounded-2xl border border-ember/30 bg-panel/50 p-3.5">
        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-ember" />
        <p className="text-sm text-bone-mut">
          Guard it like the crown jewels. Anyone who holds your key controls the
          funds. No steward of The Ravenspire will ever ask you for it.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void onExport()}
        className="btn-gold w-full px-5 py-3 text-sm"
      >
        <Icon name="eye" className="h-4 w-4" />
        Reveal my private key
      </button>

      {failed ? (
        <p className="text-xs text-bone-faint">
          The reveal window could not open just now. Try again shortly.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-bone-faint">
        Non-custodial means self-custody: the responsibility for these keys is
        yours. Store your backup somewhere only you can reach.
      </p>
    </div>
  );
}
