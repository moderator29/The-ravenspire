"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Icon } from "@/components/ui/icon";
import { Button, IconButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/field";
import { Chip } from "@/components/console/console-shell";
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
    <div className="flex flex-col gap-4 md:gap-3">
      {/* Add custom token */}
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          Add a custom token
        </p>

        <div className="flex flex-col gap-2 rounded-lg border border-steel-line bg-panel/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {EVM_CHAINS.map((c) => (
              <Chip
                key={c.id}
                active={chainId === c.id}
                onClick={() => setChainId(c.id)}
                className="h-8 md:h-7"
              >
                {c.name}
              </Chip>
            ))}
          </div>

          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Contract address 0x..."
            aria-label="Contract address"
            className={`tnum h-11 w-full rounded-md border bg-panel/60 px-3 font-mono text-sm text-bone outline-none transition-colors duration-fast placeholder:font-sans placeholder:text-bone-faint focus:border-gold md:h-9 md:text-[13px] ${
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
              aria-label="Token symbol"
              className="h-11 w-1/2 rounded-md border border-steel-line bg-panel/60 px-3 text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold md:h-9 md:text-[13px]"
            />
            <input
              value={decimals}
              onChange={(e) => setDecimals(e.target.value)}
              inputMode="numeric"
              placeholder="Decimals"
              aria-label="Token decimals"
              className="tnum h-11 w-1/2 rounded-md border border-steel-line bg-panel/60 px-3 text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold md:h-9 md:text-[13px]"
            />
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Name (optional)"
            aria-label="Token name"
            className="h-11 w-full rounded-md border border-steel-line bg-panel/60 px-3 text-sm text-bone outline-none transition-colors duration-fast placeholder:text-bone-faint focus:border-gold md:h-9 md:text-[13px]"
          />

          <Button variant="gold" size="lg" block onClick={add} className="md:h-9 md:text-sm">
            <Icon name="plus" className="h-4 w-4" />
            Add token
          </Button>
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
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 md:min-h-9 md:p-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-bone md:text-[13px]">
                  {c.symbol}
                </p>
                <p className="truncate text-xs text-bone-faint md:text-[11px]">
                  {EVM_CHAINS.find((x) => x.id === c.chainId)?.name ??
                    `Chain ${c.chainId}`}{" "}
                  / {c.contract.slice(0, 6)}...{c.contract.slice(-4)}
                </p>
              </div>
              <IconButton
                icon="close"
                label={`Remove ${c.symbol}`}
                size="sm"
                variant="glass"
                onClick={() => onRemoveCustom(c.chainId, c.contract)}
              />
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
          <p className="rounded-lg border border-steel-line bg-panel/40 p-3 text-sm text-bone-mut">
            No tokens to manage yet. They appear here once your balances load.
          </p>
        ) : (
          tokens.map((t) => {
            const isHidden = hidden.includes(t.key);
            return (
              <div
                key={t.key}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-steel-line bg-panel/40 p-2.5 md:min-h-9 md:p-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <TokenLogo logo={t.logo} symbol={t.symbol} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-bone md:text-[13px]">
                      {t.symbol}
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                        {t.chainShort}
                      </span>
                    </p>
                    <p className="truncate text-xs text-bone-faint md:text-[11px]">
                      {t.name}
                    </p>
                  </div>
                </div>
                {t.isNative ? (
                  <span className="text-[11px] font-medium uppercase tracking-wide text-bone-faint">
                    Always
                  </span>
                ) : (
                  <Toggle
                    size="sm"
                    checked={!isHidden}
                    onCheckedChange={() => onToggleHidden(t.key)}
                    label={isHidden ? `Show ${t.symbol}` : `Hide ${t.symbol}`}
                  />
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
