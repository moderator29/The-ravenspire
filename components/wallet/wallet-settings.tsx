"use client";

import { Icon } from "@/components/ui/icon";
import { Toggle } from "@/components/ui/field";
import { Chip } from "@/components/console/console-shell";
import { CopyButton } from "@/components/wallet/copy-button";
import { WalletBackup } from "@/components/wallet/wallet-backup";
import {
  EVM_CHAINS,
  addressExplorerUrlFor,
  evmChainById,
  shortAddress,
} from "@/components/wallet/chains";
import { useVaultPrefs, type VaultSettings } from "@/components/wallet/wallet-prefs";

const CURRENCIES: VaultSettings["currency"][] = ["USD", "EUR", "GBP"];

/* Vault settings. Account details, the local preferences that shape the whole
   wallet (default network, hide small balances, display currency), copy /
   explorer shortcuts, the sensitive Backup / Export flow, and the self-custody
   note. Preferences persist per wallet address. */
export function WalletSettings({ address }: { address?: string }) {
  const { settings, setSettings } = useVaultPrefs(address);
  const chain = evmChainById(settings.defaultChainId);
  const explorer = address
    ? addressExplorerUrlFor(settings.defaultChainId, address)
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Account */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Account
        </p>

        {address ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-3">
            <div className="min-w-0">
              <p className="text-xs text-bone-faint">Wallet address</p>
              <code className="tnum mt-0.5 block font-mono text-sm text-bone">
                {shortAddress(address, 10, 8)}
              </code>
            </div>
            <CopyButton value={address} label="Copy address" iconOnly />
          </div>
        ) : null}

        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-3 transition-colors hover:border-gold/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel">
                <Icon name="search" className="h-4 w-4 text-gold" />
              </span>
              <div>
                <p className="text-sm font-medium text-bone">View on explorer</p>
                <p className="text-xs text-bone-faint">
                  Address on {chain?.name ?? "the network"}
                </p>
              </div>
            </div>
            <Icon name="arrow" className="h-4 w-4 shrink-0 text-bone-faint" />
          </a>
        ) : null}
      </section>

      {/* Preferences */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Preferences
        </p>

        {/* Default network */}
        <div className="rounded-lg border border-steel-line bg-panel/40 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel">
              <Icon name="signal" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-sm font-medium text-bone">Default network</p>
              <p className="text-xs text-bone-faint">
                Explorer links and new sends start here
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EVM_CHAINS.map((c) => (
              <Chip
                key={c.id}
                active={settings.defaultChainId === c.id}
                onClick={() => setSettings({ defaultChainId: c.id })}
                className="h-8 md:h-7"
              >
                {c.name}
              </Chip>
            ))}
          </div>
        </div>

        {/* Hide small balances */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel">
              <Icon name="eye" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-sm font-medium text-bone">
                Hide small balances
              </p>
              <p className="text-xs text-bone-faint">
                Tuck away tokens under $1
              </p>
            </div>
          </div>
          <Toggle
            size="sm"
            label="Hide small balances"
            checked={settings.hideSmall}
            onCheckedChange={(next) => setSettings({ hideSmall: next })}
          />
        </div>

        {/* Currency display */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel">
              <Icon name="coin" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-sm font-medium text-bone">Display currency</p>
              <p className="text-xs text-bone-faint">
                Values are priced by the provider in USD
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {CURRENCIES.map((c) => (
              <Chip
                key={c}
                active={settings.currency === c}
                onClick={() => setSettings({ currency: c })}
                className="h-8 md:h-7"
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      {/* Backup / Export */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Backup and recovery
        </p>
        <div className="rounded-2xl border border-steel-line bg-panel/40 p-4">
          <WalletBackup />
        </div>
      </section>

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-2xl border border-gold/15 bg-panel/40 p-3.5">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <p className="text-xs leading-relaxed text-bone-mut">
          Non-custodial means self-custody. The Ravenspire never holds your keys and
          cannot move your funds. Guard your recovery phrase; anyone who holds it
          controls the wallet. We will never ask you for it.
        </p>
      </div>
    </div>
  );
}
