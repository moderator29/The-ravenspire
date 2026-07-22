"use client";

/*
  A tiny client-only watchlist for coins, kept on this device. One source of
  truth shared by every star in the app (rows in the Scrying Glass and the
  coin page itself) so a tap in one place lights up everywhere at once, with
  no server round-trip and nothing to leak. Real, local, honest.
*/

const KEY = "ravenspire.coins.watchlist";

type Store = Record<string, true>;
type Listener = () => void;

let store: Store | null = null;
const listeners = new Set<Listener>();

function read(): Store {
  if (store) return store;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    store = raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    store = {};
  }
  return store;
}

function persist(next: Store) {
  store = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode errors: the in-memory copy still works */
  }
  for (const l of listeners) l();
}

/* Addresses are compared case-insensitively so an EVM checksum address and a
   lowercased one never split into two entries. */
function normalize(id: string): string {
  return id.trim().toLowerCase();
}

export function isWatched(id: string): boolean {
  if (!id) return false;
  return read()[normalize(id)] === true;
}

export function toggleWatch(id: string): boolean {
  if (!id) return false;
  const key = normalize(id);
  const current = read();
  const next: Store = { ...current };
  let watched: boolean;
  if (next[key]) {
    delete next[key];
    watched = false;
  } else {
    next[key] = true;
    watched = true;
  }
  persist(next);
  return watched;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
