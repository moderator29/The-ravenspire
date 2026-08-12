"use client";

import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { WalletLive } from "@/components/wallet/wallet-live";
import { WalletCard } from "@/components/wallet/wallet-card";
import { CopyButton } from "@/components/wallet/copy-button";
import { Icon } from "@/components/ui/icon";
import { shortAddress } from "@/components/wallet/chains";

/* Wallet body. When the Gatehouse (Privy) is mounted, renders the full live,
   non-custodial wallet overview. Otherwise it degrades honestly to the true
   receiving address with a note that sending and backup are resting, never
   inventing balances or dead controls. Stable export used by the wallet route
   and settings. */
export function WalletSection() {
  const { enabled, authenticated, address } = useRealmAuth();
  /* Only ever surface an Ethereum (0x) address here; never a Solana one. */
  const addr =
    authenticated && address?.startsWith("0x") ? address : undefined;

  if (enabled) {
    return <WalletLive address={addr} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <WalletCard icon="wallet" title="Realm Wallet" caption="Non-custodial">
        {addr ? (
          <>
            <p className="text-sm text-bone-mut">
              This is your realm wallet address. It is yours alone,
              non-custodial, and safe to share to receive coin and tokens.
            </p>
            <div className="mt-4 rounded-2xl border border-steel-line bg-panel/50 p-3.5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Wallet address
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <code className="tnum min-w-0 break-all font-mono text-sm text-bone">
                  {shortAddress(addr, 10, 8)}
                </code>
                <CopyButton value={addr} label="Copy address" iconOnly />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-gold/15 bg-panel/40 px-3.5 py-2.5">
              <Icon name="lock" className="h-4 w-4 shrink-0 text-gold" />
              <p className="text-xs text-bone-mut">
                Non-custodial. You hold the keys, and only you can move these
                funds.
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-bone-mut">
            No wallet is bound to your banner yet. Once one is forged, your
            receiving address appears here.
          </p>
        )}
      </WalletCard>

      <WalletCard icon="lock" title="Send and backup" caption="Resting">
        <p className="text-sm text-bone-mut">
          The Gatehouse is not mounted in this environment, so live balance,
          sending, and key export are resting. Your receiving address above is
          always yours.
        </p>
      </WalletCard>
    </div>
  );
}
