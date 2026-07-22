"use client";

import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";
import { TokenLogo } from "@/components/wallet/token-logo";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { WalletReceive } from "@/components/wallet/wallet-receive";
import { WalletSwap } from "@/components/wallet/wallet-swap";
import { WalletEarn } from "@/components/wallet/wallet-earn";
import { WalletSettings } from "@/components/wallet/wallet-settings";
import { CoinList } from "@/components/wallet/coin-list";
import { CoinDetail } from "@/components/wallet/coin-detail";
import { ManageTokens } from "@/components/wallet/manage-tokens";
import { WalletHistory } from "@/components/wallet/wallet-history";
import { WalletWatchlist } from "@/components/wallet/wallet-watchlist";
import type { SendCapableWallet } from "@/components/wallet/wallet-send-flow";
import type { TokenFilters } from "@/components/wallet/token-filter";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import { useWalletTokens } from "@/components/wallet/use-wallet-tokens";
import { useVaultPrefs } from "@/components/wallet/wallet-prefs";
import { chainMetaFor, shortAddress } from "@/components/wallet/chains";

type Panel =
  | "coin"
  | "send-pick"
  | "receive"
  | "swap"
  | "earn"
  | "manage"
  | "history"
  | "settings"
  | null;

/* The full multi-chain, Trust / Exodus style wallet overview, on top of the
   Privy embedded EVM (0x) wallet. A total-value hero, a Send / Receive / Swap /
   Earn action row, the live multi-chain coin list (real balances via the
   Covalent balances route, with per-token logos), a coin detail sheet with
   scoped Send / Receive, Manage tokens, a watchlist, and transaction history.
   Real data only; never an invented balance. MUST render only when Privy is
   enabled so useWallets / useSendTransaction have their provider. */
export function WalletLive({ address }: { address?: string }) {
  const { wallets, ready } = useWallets();

  /* Resolve the embedded EVM wallet with a 0x address; guard hard so a Solana
     (base58) address can never leak into this view. */
  const wallet = useMemo(() => {
    const evm = wallets.filter((w) => w.address?.startsWith("0x"));
    if (!evm.length) return undefined;
    const embedded = evm.find(
      (w) =>
        w.walletClientType === "privy" || w.walletClientType === "privy-v2"
    );
    const byAddress =
      address && address.startsWith("0x")
        ? evm.find((w) => w.address.toLowerCase() === address.toLowerCase())
        : undefined;
    return embedded ?? byAddress ?? evm[0];
  }, [wallets, address]);

  const walletAddress =
    wallet?.address ?? (address?.startsWith("0x") ? address : undefined);

  const sendWallet: SendCapableWallet | undefined = useMemo(
    () =>
      wallet
        ? { address: wallet.address, switchChain: (id) => wallet.switchChain(id) }
        : undefined,
    [wallet]
  );

  const prefs = useVaultPrefs(walletAddress);
  const { tokens, totalUsd, loading, configured, error, refresh } =
    useWalletTokens(walletAddress, prefs.custom);

  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<WalletToken | null>(null);
  const [initialView, setInitialView] = useState<"overview" | "send" | "receive">(
    "overview"
  );
  // Chain filter is local; the hide-small toggle shares one source of truth
  // with the settings sheet so the two controls never disagree.
  const [chainFilter, setChainFilter] = useState<number[]>([]);
  const effectiveFilters: TokenFilters = {
    chains: chainFilter,
    hideSmall: prefs.settings.hideSmall,
  };
  const onFilters = useCallback(
    (next: TokenFilters) => {
      setChainFilter(next.chains);
      if (next.hideSmall !== prefs.settings.hideSmall) {
        prefs.setSettings({ hideSmall: next.hideSmall });
      }
    },
    [prefs]
  );

  const visibleTokens = useMemo(
    () => tokens.filter((t) => !prefs.hidden.includes(t.key)),
    [tokens, prefs.hidden]
  );

  const openCoin = useCallback(
    (token: WalletToken, view: "overview" | "send" | "receive" = "overview") => {
      setSelected(token);
      setInitialView(view);
      setPanel("coin");
    },
    []
  );

  const defaultChainMeta = chainMetaFor(prefs.settings.defaultChainId);

  if (ready && !wallet) {
    return (
      <section className="glass p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-steel-line bg-panel">
          <Icon name="wallet" className="h-5 w-5 text-gold" />
        </div>
        <h2 className="font-display mt-4 text-lg font-semibold text-bone">
          Forging your wallet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-bone-mut">
          No embedded wallet is ready yet. One is created automatically once you
          are fully signed in.
        </p>
      </section>
    );
  }

  const totalText = totalUsd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Balance hero */}
      <section className="glass glass-warm relative overflow-hidden p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-panel">
              <Icon name="wallet" className="h-5 w-5 text-gold" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-bone">
                The Vault
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-steel-line bg-panel/60 px-2.5 py-0.5 text-[11px] font-medium text-bone-mut">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                Multi-chain EVM
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPanel("settings")}
            aria-label="Wallet settings"
            title="Wallet settings"
            className="btn-glass inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
          >
            <Icon name="sliders" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-bone-faint">
            Total value
          </p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <p className="gold-text font-display tnum text-4xl font-semibold leading-none sm:text-5xl">
              <span className="text-2xl sm:text-3xl">$</span>
              {totalText}
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh balances"
              className="btn-glass inline-flex h-9 w-9 shrink-0 items-center justify-center p-0 disabled:opacity-50"
            >
              <Icon
                name="repost"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <p className="mt-2 text-xs text-bone-faint">
            {loading
              ? "Reading balances across chains..."
              : !configured
                ? "Balance provider resting in this environment"
                : error
                  ? "Balances could not be read just now. Try refreshing."
                  : "Across all supported EVM chains, priced by the provider"}
          </p>
        </div>

        {walletAddress ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-steel-line/60 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-bone-faint">
                Address
              </span>
              <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
                {shortAddress(walletAddress, 8, 6)}
              </code>
            </div>
            <CopyButton value={walletAddress} label="Copy address" iconOnly />
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-gold/15 bg-panel/40 px-3.5 py-2.5">
          <Icon name="lock" className="h-4 w-4 shrink-0 text-gold" />
          <p className="text-xs text-bone-mut">
            Non-custodial. You hold the keys, and only you can move these funds.
          </p>
        </div>
      </section>

      {/* Action row */}
      <section className="glass p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 sm:justify-around">
          <ActionButton
            icon="send"
            label="Send"
            primary
            onClick={() => setPanel("send-pick")}
          />
          <ActionButton
            icon="arrow"
            iconClassName="rotate-90"
            label="Receive"
            onClick={() => setPanel("receive")}
          />
          <ActionButton
            icon="repost"
            label="Swap"
            onClick={() => setPanel("swap")}
          />
          <ActionButton
            icon="crown"
            label="Earn"
            onClick={() => setPanel("earn")}
          />
        </div>
      </section>

      {/* Multi-chain coin list */}
      <CoinList
        tokens={visibleTokens}
        filters={effectiveFilters}
        onFilters={onFilters}
        onSelect={(t) => openCoin(t, "overview")}
        onManage={() => setPanel("manage")}
        loading={loading}
        configured={configured}
        error={error}
      />

      {/* Watchlist */}
      <WalletWatchlist watch={prefs.watch} onToggleWatch={prefs.toggleWatch} />

      {/* Transaction history */}
      <WalletHistory
        txs={prefs.txs}
        address={walletAddress}
        defaultChainId={prefs.settings.defaultChainId}
        compact
      />
      {prefs.txs.length > 4 ? (
        <button
          type="button"
          onClick={() => setPanel("history")}
          className="btn-glass -mt-2 inline-flex w-full items-center justify-center gap-1.5 px-4 py-2 text-xs"
        >
          View all {prefs.txs.length} transactions
        </button>
      ) : null}

      {/* Coin detail */}
      <WalletModal
        open={panel === "coin" && !!selected}
        onClose={() => setPanel(null)}
        title={selected?.symbol ?? "Coin"}
        caption={selected?.chainName}
        icon="coin"
      >
        {selected ? (
          <CoinDetail
            token={selected}
            address={walletAddress}
            wallet={sendWallet}
            initialView={initialView}
            onRecorded={prefs.recordTx}
            onRefresh={refresh}
          />
        ) : null}
      </WalletModal>

      {/* Send: pick an asset first */}
      <WalletModal
        open={panel === "send-pick"}
        onClose={() => setPanel(null)}
        title="Send"
        caption="Choose an asset"
        icon="send"
      >
        <AssetPicker
          tokens={visibleTokens.filter((t) => {
            try {
              return BigInt(t.balanceRaw) > 0n;
            } catch {
              return false;
            }
          })}
          emptyLabel="You have no coin to send yet. Receive some first."
          onSelect={(t) => openCoin(t, "send")}
        />
      </WalletModal>

      {/* Receive: address is shared across every EVM chain */}
      <WalletModal
        open={panel === "receive"}
        onClose={() => setPanel(null)}
        title="Receive"
        caption="Any EVM chain"
        icon="arrow"
      >
        <WalletReceive address={walletAddress} chainMeta={defaultChainMeta} />
      </WalletModal>

      {/* Manage tokens */}
      <WalletModal
        open={panel === "manage"}
        onClose={() => setPanel(null)}
        title="Manage tokens"
        caption="Show, hide, add custom"
        icon="sliders"
      >
        <ManageTokens
          tokens={tokens}
          hidden={prefs.hidden}
          custom={prefs.custom}
          onToggleHidden={prefs.toggleHidden}
          onAddCustom={prefs.addCustom}
          onRemoveCustom={prefs.removeCustom}
        />
      </WalletModal>

      {/* Full history */}
      <WalletModal
        open={panel === "history"}
        onClose={() => setPanel(null)}
        title="Transaction history"
        caption="Your transfers"
        icon="scroll"
      >
        <WalletHistory
          txs={prefs.txs}
          address={walletAddress}
          defaultChainId={prefs.settings.defaultChainId}
        />
      </WalletModal>

      <WalletModal
        open={panel === "swap"}
        onClose={() => setPanel(null)}
        title="Swap"
        caption="In-wallet"
        icon="repost"
      >
        <WalletSwap chainMeta={defaultChainMeta} />
      </WalletModal>

      <WalletModal
        open={panel === "earn"}
        onClose={() => setPanel(null)}
        title="Earn"
        caption="Referrals"
        icon="crown"
      >
        <WalletEarn />
      </WalletModal>

      <WalletModal
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        title="Wallet settings"
        caption="Account and preferences"
        icon="sliders"
      >
        <WalletSettings address={walletAddress} />
      </WalletModal>
    </div>
  );
}

function AssetPicker({
  tokens,
  emptyLabel,
  onSelect,
}: {
  tokens: WalletToken[];
  emptyLabel: string;
  onSelect: (token: WalletToken) => void;
}) {
  if (tokens.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-steel-line bg-panel/25 p-6 text-center text-sm text-bone-mut">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {tokens.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t)}
          className="flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3 text-left transition-colors hover:border-gold/40"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <TokenLogo logo={t.logo} symbol={t.symbol} size={38} />
              <span className="absolute -bottom-1 -right-1 rounded-full border border-obsidian bg-panel-warm px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-gold">
                {t.chainShort}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-bone">
                {t.symbol}
              </p>
              <p className="truncate text-xs text-bone-faint">{t.chainName}</p>
            </div>
          </div>
          <p className="tnum shrink-0 text-sm font-semibold text-bone">
            {t.balanceDisplay}
          </p>
        </button>
      ))}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary = false,
  iconClassName = "",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
  iconClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-1 flex-col items-center gap-2.5"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-200 ${
          primary
            ? "gold-metal border-gold/50 text-[#171204] shadow-[0_8px_24px_rgba(200,162,76,0.22)] group-hover:brightness-105"
            : "border-steel-line bg-panel/60 text-gold group-hover:border-gold/45 group-hover:bg-panel"
        }`}
      >
        <Icon name={icon} className={`h-5 w-5 ${iconClassName}`} />
      </span>
      <span className="text-xs font-medium text-bone-mut transition-colors group-hover:text-bone">
        {label}
      </span>
    </button>
  );
}
