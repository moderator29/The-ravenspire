"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";
import { AddressQR } from "@/components/wallet/address-qr";
import { TokenLogo } from "@/components/wallet/token-logo";
import {
  WalletSendFlow,
  type SendCapableWallet,
} from "@/components/wallet/wallet-send-flow";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import type { TxRecord } from "@/components/wallet/wallet-prefs";
import {
  addressExplorerUrlFor,
  tokenExplorerUrlFor,
  evmChainById,
} from "@/components/wallet/chains";

type View = "overview" | "send" | "receive";

/* Coin detail sheet (Exodus / Trust style). Shows one coin's balance on one
   chain with its USD value and price move, then Send and Receive actions
   scoped to exactly that coin + chain. Rendered as the body of a wallet modal. */
export function CoinDetail({
  token,
  address,
  wallet,
  initialView = "overview",
  onRecorded,
  onRefresh,
}: {
  token: WalletToken;
  address: string | undefined;
  wallet: SendCapableWallet | undefined;
  initialView?: View;
  onRecorded: (tx: TxRecord) => void;
  onRefresh: () => void;
}) {
  const [view, setView] = useState<View>(initialView);
  const chain = evmChainById(token.chainId);

  if (view === "send") {
    return (
      <div className="flex flex-col gap-4">
        <BackRow onBack={() => setView("overview")} label="Send" />
        <WalletSendFlow
          token={token}
          wallet={wallet}
          onRecorded={onRecorded}
          onSent={onRefresh}
        />
      </div>
    );
  }

  if (view === "receive") {
    const addrExplorer = address
      ? addressExplorerUrlFor(token.chainId, address)
      : null;
    return (
      <div className="flex flex-col gap-4">
        <BackRow onBack={() => setView("overview")} label="Receive" />
        {address ? (
          <>
            <p className="text-sm text-bone-mut">
              Scan or copy to receive {token.symbol} and other assets on{" "}
              {chain?.name ?? token.chainName}. This is your non-custodial
              address, safe to share.
            </p>
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-steel-line bg-panel/40 p-5">
              <AddressQR value={address} />
              <div className="flex items-center gap-2 rounded-full border border-gold/25 bg-panel-warm/60 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-bone-mut">
                  {chain?.name ?? token.chainName} / EVM only
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-steel-line bg-panel/50 p-3.5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
                Wallet address
              </p>
              <code className="tnum mt-1.5 block break-all font-mono text-sm leading-relaxed text-bone">
                {address}
              </code>
            </div>
            <div className="flex gap-2">
              <CopyButton
                value={address}
                label="Copy address"
                className="btn-gold inline-flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm"
              />
              {addrExplorer ? (
                <a
                  href={addrExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-glass inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm"
                >
                  <Icon name="arrow" className="h-4 w-4" />
                  Explorer
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-bone-mut">
            No wallet is bound yet, so there is no receiving address to show.
          </p>
        )}
      </div>
    );
  }

  /* ----- Overview ----- */
  const tokenExplorer = token.contract
    ? tokenExplorerUrlFor(token.chainId, token.contract)
    : chain
      ? chain.explorer
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/20 bg-panel-warm/50 p-5 text-center">
        <div className="relative">
          <TokenLogo logo={token.logo} symbol={token.symbol} size={56} />
          <span className="absolute -bottom-1 -right-1 rounded-full border border-obsidian bg-panel px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-gold">
            {token.chainShort}
          </span>
        </div>
        <div>
          <p className="gold-text font-display tnum text-3xl font-semibold leading-none">
            {token.balanceDisplay}
            <span className="ml-1.5 text-lg">{token.symbol}</span>
          </p>
          {token.quoteUsd > 0 ? (
            <p className="tnum mt-1.5 text-sm text-bone-mut">
              ${token.quoteUsd.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
              {token.change24h !== 0 ? (
                <span
                  className={token.change24h >= 0 ? "text-gold" : "text-ember"}
                >
                  {" "}
                  {token.change24h >= 0 ? "+" : ""}
                  {token.change24h.toFixed(2)}% 24h
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-bone-faint">
              {token.name} on {chain?.name ?? token.chainName}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setView("send")}
          className="btn-gold flex items-center justify-center gap-2 px-4 py-3 text-sm"
        >
          <Icon name="send" className="h-4 w-4" />
          Send
        </button>
        <button
          type="button"
          onClick={() => setView("receive")}
          className="btn-glass flex items-center justify-center gap-2 px-4 py-3 text-sm"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-90" />
          Receive
        </button>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl border border-steel-line bg-panel/40 p-3.5">
        <Row label="Network" value={chain?.name ?? token.chainName} />
        {token.priceUsd > 0 ? (
          <Row
            label="Price"
            value={`$${token.priceUsd.toLocaleString(undefined, {
              maximumFractionDigits: token.priceUsd < 1 ? 6 : 2,
            })}`}
          />
        ) : null}
        <Row
          label="Type"
          value={token.isNative ? "Native coin" : "ERC-20 token"}
        />
        {token.contract ? (
          <div className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-xs text-bone-faint">Contract</span>
            <div className="flex items-center gap-2">
              <code className="tnum font-mono text-xs text-bone-mut">
                {token.contract.slice(0, 6)}...{token.contract.slice(-4)}
              </code>
              <CopyButton value={token.contract} label="Copy contract" iconOnly />
            </div>
          </div>
        ) : null}
      </div>

      {tokenExplorer ? (
        <a
          href={tokenExplorer}
          target="_blank"
          rel="noreferrer"
          className="btn-glass inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm"
        >
          <Icon name="search" className="h-4 w-4" />
          View on {chain?.name ?? "explorer"}
        </a>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-bone-faint">{label}</span>
      <span className="text-sm font-medium text-bone">{value}</span>
    </div>
  );
}

function BackRow({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-bone-mut transition-colors hover:text-bone"
    >
      <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
      Back to {label}
    </button>
  );
}
