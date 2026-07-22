"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Icon } from "@/components/ui/icon";
import { TokenLogo } from "@/components/wallet/token-logo";
import { EVM_CHAINS } from "@/components/wallet/chains";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import type { CustomToken } from "@/components/wallet/wallet-prefs";

/* Manage tokens: show or hide any token in the list, and add a custom EVM
   token by contract address. Native coins are always shown (they are the gas
   coin for their chain) so they cannot be hidden into invisibility. The
   visible / custom set persists locally. */
export function ManageTokens({
  tokens,
  hidden,
  custom,
  onToggleHidden,
  onAddCustom,
  onRemoveCustom,
}: {
  tokens: WalletToken[];
  hidden: string[];
  custom: CustomToken[];
  onToggleHidden: (key: string) => void;
  onAddCustom: (token: CustomToken) => void;
  onRemoveCustom: (chainId: number, contract: string) => void;
}) {
  const [chainId, setChainId] = useState<number>(EVM_CHAINS[0].id);
  const [contract, setContract] = useState("");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [decimals, setDecimals] = useState("18");
  const [note, setNote] = useState<string | null>(null);

  const contractValid = contract.trim() === "" || isAddress(contract.trim());
  const customContracts = new Set(
    custom.map((c) => `${c.chainId}:${c.contract.toLowerCase()}`)
  );

  const add = () => {
    setNote(null);
    const addr = contract.trim();
    if (!isAddress(addr)) {
      setNote("Enter a valid EVM contract address.");
      return;
    }
    if (!symbol.trim()) {
      setNote("Give the token a symbol so it reads clearly in your list.");
      return;
    }
    const dec = Number(decimals);
    if (!Number.isInteger(dec) || dec < 0 || dec > 36) {
      setNote("Decimals must be a whole number between 0 and 36.");
      return;
    }
    if (customContracts.has(`${chainId}:${addr.toLowerCase()}`)) {
      setNote("That token is already in your custom list.");
      return;
    }
    onAddCustom({
      chainId,
      contract: addr,
      symbol: symbol.trim().toUpperCase().slice(0, 12),
      name: name.trim().slice(0, 40) || symbol.trim().toUpperCase(),
      decimals: dec,
    });
    setContract("");
    setSymbol("");
    setName("");
    setDecimals("18");
    setNote("Token added. It now appears in your list.");
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Add custom token */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Add a custom token
        </p>

        <div className="flex flex-col gap-2.5 rounded-2xl border border-steel-line bg-panel/40 p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {EVM_CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChainId(c.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  chainId === c.id
                    ? "border-gold/50 bg-panel-warm text-gold"
                    : "border-steel-line bg-panel/40 text-bone-mut"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Contract address 0x..."
            className={`tnum w-full rounded-xl border bg-panel/60 px-3 py-2.5 font-mono text-sm text-bone outline-none transition-colors placeholder:text-bone-faint focus:border-gold ${
              contractValid ? "border-steel-line" : "border-ember/60"
            }`}
          />
          {!contractValid ? (
            <span className="text-xs text-ember">
              That is not a valid contract address.
            </span>
          ) : null}

          <div className="flex gap-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="Symbol"
              className="w-1/2 rounded-xl border border-steel-line bg-panel/60 px-3 py-2.5 text-sm text-bone outline-none placeholder:text-bone-faint focus:border-gold"
            />
            <input
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              inputMode="numeric"
              placeholder="Decimals"
              className="tnum w-1/2 rounded-xl border border-steel-line bg-panel/60 px-3 py-2.5 text-sm text-bone outline-none placeholder:text-bone-faint focus:border-gold"
            />
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Name (optional)"
            className="w-full rounded-xl border border-steel-line bg-panel/60 px-3 py-2.5 text-sm text-bone outline-none placeholder:text-bone-faint focus:border-gold"
          />

          <button
            type="button"
            onClick={add}
            className="btn-gold w-full px-4 py-2.5 text-sm"
          >
            <Icon name="plus" className="h-4 w-4" />
            Add token
          </button>
          {note ? <p className="text-xs text-bone-mut">{note}</p> : null}
          <p className="text-xs leading-relaxed text-bone-faint">
            Custom tokens are EVM only. Its live balance shows once the wallet
            holds some; nothing is invented before then.
          </p>
        </div>
      </section>

      {/* Custom list with remove */}
      {custom.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            Your custom tokens
          </p>
          {custom.map((c) => (
            <div
              key={`${c.chainId}:${c.contract}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-bone">{c.symbol}</p>
                <p className="truncate text-xs text-bone-faint">
                  {EVM_CHAINS.find((x) => x.id === c.chainId)?.name ??
                    `Chain ${c.chainId}`}{" "}
                  / {c.contract.slice(0, 6)}...{c.contract.slice(-4)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveCustom(c.chainId, c.contract)}
                aria-label={`Remove ${c.symbol}`}
                className="btn-glass inline-flex h-8 w-8 items-center justify-center p-0"
              >
                <Icon name="plus" className="h-4 w-4 rotate-45" />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {/* Show / hide */}
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Show or hide
        </p>
        {tokens.length === 0 ? (
          <p className="rounded-2xl border border-steel-line bg-panel/40 p-3.5 text-sm text-bone-mut">
            No tokens to manage yet. They appear here once your balances load.
          </p>
        ) : (
          tokens.map((t) => {
            const isHidden = hidden.includes(t.key);
            return (
              <div
                key={t.key}
                className="flex items-center justify-between gap-3 rounded-2xl border border-steel-line bg-panel/40 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TokenLogo logo={t.logo} symbol={t.symbol} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-bone">
                      {t.symbol}
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                        {t.chainShort}
                      </span>
                    </p>
                    <p className="truncate text-xs text-bone-faint">{t.name}</p>
                  </div>
                </div>
                {t.isNative ? (
                  <span className="text-[11px] font-medium uppercase tracking-wide text-bone-faint">
                    Always
                  </span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!isHidden}
                    aria-label={isHidden ? `Show ${t.symbol}` : `Hide ${t.symbol}`}
                    onClick={() => onToggleHidden(t.key)}
                    className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                      !isHidden
                        ? "border-gold/50 bg-gold/30"
                        : "border-steel-line bg-panel"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-gold transition-all ${
                        !isHidden ? "left-4" : "left-0.5"
                      }`}
                    />
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
