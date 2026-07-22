"use client";

import { useCallback, useSyncExternalStore } from "react";

/* Local, per-wallet preferences for the Vault: which tokens are hidden, any
   custom tokens the member added by contract address, their watchlist, the
   settings toggles, and a record of their own sent transactions so history
   survives even when a provider transactions feed is unavailable. Everything
   is scoped by the 0x address so two accounts on one device never bleed into
   each other. Persisted to localStorage; never anything sensitive (no keys). */

export interface CustomToken {
  chainId: number;
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface WatchItem {
  query: string;
  label: string;
}

export interface TxRecord {
  hash: string;
  chainId: number;
  to: string;
  symbol: string;
  amount: string;
  contract: string | null;
  at: number;
}

export interface VaultSettings {
  defaultChainId: number;
  hideSmall: boolean;
  currency: "USD" | "EUR" | "GBP";
}

export const DEFAULT_SETTINGS: VaultSettings = {
  defaultChainId: 1,
  hideSmall: false,
  currency: "USD",
};

type Store = {
  hidden: string[];
  custom: CustomToken[];
  watch: WatchItem[];
  settings: VaultSettings;
  txs: TxRecord[];
};

const EMPTY: Store = {
  hidden: [],
  custom: [],
  watch: [],
  settings: DEFAULT_SETTINGS,
  txs: [],
};

const EVENT = "vault-prefs-change";

function keyFor(addr: string | undefined): string {
  return `vault:prefs:${(addr ?? "anon").toLowerCase()}`;
}

/* Module-level snapshot cache so useSyncExternalStore receives a STABLE object
   reference between mutations (returning a fresh JSON.parse each call would
   loop React). Keyed by the raw serialized value per storage key. */
const snapCache = new Map<string, { raw: string; store: Store }>();

function read(addr: string | undefined): Store {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(keyFor(addr));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      watch: Array.isArray(parsed.watch) ? parsed.watch : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      txs: Array.isArray(parsed.txs) ? parsed.txs : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(addr: string | undefined, store: Store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(addr), JSON.stringify(store));
  } catch {
    /* storage full or unavailable; stay quiet */
  }
  window.dispatchEvent(new Event(EVENT));
}

/* Subscribe to a live view of the prefs for one wallet. Re-renders on any
   local mutation or a change from another tab. */
export function useVaultPrefs(addr: string | undefined) {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    const storageKey = keyFor(addr);
    const raw =
      typeof window === "undefined"
        ? ""
        : window.localStorage.getItem(storageKey) ?? "";
    const cached = snapCache.get(storageKey);
    if (cached && cached.raw === raw) return cached.store;
    const next = read(addr);
    snapCache.set(storageKey, { raw, store: next });
    return next;
  }, [addr]);

  const store = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const mutate = useCallback(
    (fn: (s: Store) => Store) => {
      write(addr, fn(read(addr)));
    },
    [addr]
  );

  const toggleHidden = useCallback(
    (tokenKey: string) => {
      mutate((s) => ({
        ...s,
        hidden: s.hidden.includes(tokenKey)
          ? s.hidden.filter((k) => k !== tokenKey)
          : [...s.hidden, tokenKey],
      }));
    },
    [mutate]
  );

  const addCustom = useCallback(
    (token: CustomToken) => {
      mutate((s) => {
        const exists = s.custom.some(
          (c) =>
            c.chainId === token.chainId &&
            c.contract.toLowerCase() === token.contract.toLowerCase()
        );
        return exists ? s : { ...s, custom: [...s.custom, token] };
      });
    },
    [mutate]
  );

  const removeCustom = useCallback(
    (chainId: number, contract: string) => {
      mutate((s) => ({
        ...s,
        custom: s.custom.filter(
          (c) =>
            !(
              c.chainId === chainId &&
              c.contract.toLowerCase() === contract.toLowerCase()
            )
        ),
      }));
    },
    [mutate]
  );

  const toggleWatch = useCallback(
    (item: WatchItem) => {
      mutate((s) => {
        const q = item.query.toLowerCase();
        const has = s.watch.some((w) => w.query.toLowerCase() === q);
        return {
          ...s,
          watch: has
            ? s.watch.filter((w) => w.query.toLowerCase() !== q)
            : [...s.watch, item],
        };
      });
    },
    [mutate]
  );

  const setSettings = useCallback(
    (patch: Partial<VaultSettings>) => {
      mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    },
    [mutate]
  );

  const recordTx = useCallback(
    (tx: TxRecord) => {
      mutate((s) => ({ ...s, txs: [tx, ...s.txs].slice(0, 100) }));
    },
    [mutate]
  );

  return {
    hidden: store.hidden,
    custom: store.custom,
    watch: store.watch,
    settings: store.settings,
    txs: store.txs,
    toggleHidden,
    addCustom,
    removeCustom,
    toggleWatch,
    setSettings,
    recordTx,
  };
}
