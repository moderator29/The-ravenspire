"use client";

import { realmFetch } from "@/lib/auth/api";

/*
  The coin watchlist, one shared store for every star in the app (rows in the
  Scrying Glass and the coin page itself) so a tap in one place lights up
  everywhere at once. The server (public.watchlist_items, via /api/watchlist)
  is the source of truth, so a member's starred coins follow them to a second
  device or a cleared browser. A watched coin is identified by (chainId,
  address), never address alone, so the same address on two different chains
  never collides.

  useSyncExternalStore in watch-star.tsx needs getSnapshot to stay synchronous,
  so this keeps an in-memory cache that reads synchronously (isWatched) and is
  populated by one async fetch from the server, fired on first subscribe and
  cached for the session. toggleWatch updates the cache immediately
  (optimistic) and fires the POST/DELETE in the background; a rejected request
  rolls the change back and notifies listeners again, so the UI never keeps
  showing a state the server refused.

  First paint, before that fetch resolves: rather than claim nothing is
  watched (a real regression from the old synchronous localStorage read), this
  reads a small local hint cache and answers from that until the server
  responds. On a device that has never loaded the new store, the hint falls
  back to the previous version's address-only local key, so a member's
  existing stars still light up on first paint; they are honest as a hint,
  since that old key carries no chain, and are replaced the moment the real,
  chain-aware answer comes back from the server.
*/

const OLD_KEY = "ravenspire.coins.watchlist";
const HINT_KEY = "ravenspire.coins.watchlist.v2";

type Listener = () => void;

/* Server-confirmed truth, once the first load resolves. Null until then. */
let serverItems: Set<string> | null = null;
/* Keys with a tap in flight (or just rejected), overriding serverItems/hint
   until the round trip settles. */
const optimistic = new Map<string, boolean>();
let hint: Set<string> | null = null;
let loadStarted = false;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

/* Addresses are compared case-insensitively so an EVM checksum address and a
   lowercased one never split into two entries. */
function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function key(chainId: number, address: string): string {
  return `${chainId}:${normalizeAddress(address)}`;
}

function isCompositeKey(k: string): boolean {
  return k.includes(":");
}

/* The local hint, read once and cached. Prefers this version's own
   (chainId,address) cache; falls back to the previous version's address-only
   key so an existing member's stars still show on first paint. */
function readHint(): Set<string> {
  if (hint) return hint;
  hint = new Set();
  if (typeof window === "undefined") return hint;
  try {
    const rawV2 = window.localStorage.getItem(HINT_KEY);
    if (rawV2) {
      for (const k of JSON.parse(rawV2) as string[]) hint.add(k);
      return hint;
    }
  } catch {
    /* ignore malformed/quota errors, fall through to the old key */
  }
  try {
    const rawV1 = window.localStorage.getItem(OLD_KEY);
    if (rawV1) {
      const store = JSON.parse(rawV1) as Record<string, true>;
      for (const address of Object.keys(store)) hint.add(address);
    }
  } catch {
    /* ignore: an empty hint is still honest */
  }
  return hint;
}

/* Best current answer as a set of composite keys: server truth (or, before it
   loads, whatever composite-format hint we have) with in-flight optimistic
   changes applied on top. Persisted after every change so the next first
   paint on this device starts from the freshest known answer. */
function currentComposite(): Set<string> {
  const base = new Set(
    serverItems ?? [...readHint()].filter(isCompositeKey)
  );
  for (const [k, watched] of optimistic) {
    if (watched) base.add(k);
    else base.delete(k);
  }
  return base;
}

function persistHint() {
  hint = currentComposite();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify([...hint]));
  } catch {
    /* ignore quota / private-mode errors: the in-memory copy still works */
  }
}

function loadFromServer() {
  if (loadStarted || typeof window === "undefined") return;
  loadStarted = true;
  void (async () => {
    try {
      const res = await realmFetch<{
        items: { chainId: number; address: string }[];
      }>("/api/watchlist");
      if (!res.ok || !res.data) return; // keep the hint; nothing confirmed yet
      const next = new Set<string>();
      for (const it of res.data.items) next.add(key(it.chainId, it.address));
      serverItems = next;
      persistHint();
      notify();
    } catch {
      /* offline or unreachable: the hint keeps answering */
    }
  })();
}

export function isWatched(chainId: number, address: string): boolean {
  if (!address) return false;
  const k = key(chainId, address);
  if (optimistic.has(k)) return optimistic.get(k) === true;
  if (serverItems) return serverItems.has(k);
  // Not loaded yet: answer from the local hint, composite or (pre-migration)
  // address-only, so first paint is never a false "nothing watched".
  const h = readHint();
  return h.has(k) || h.has(normalizeAddress(address));
}

export function toggleWatch(chainId: number, address: string): boolean {
  if (!address) return false;
  const k = key(chainId, address);
  const was = isWatched(chainId, address);
  const next = !was;

  optimistic.set(k, next);
  persistHint();
  notify();

  void (async () => {
    const method = next ? "POST" : "DELETE";
    let ok = false;
    try {
      const res = await realmFetch(`/api/watchlist`, {
        method,
        json: { chainId, address },
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    if (ok) {
      // Confirmed: fold into server truth (once it exists) and clear the
      // override so future reads come straight from serverItems again.
      if (serverItems) {
        if (next) serverItems.add(k);
        else serverItems.delete(k);
      }
    }
    // Rejected: drop the optimistic override so the read falls back to
    // whatever server truth (or hint) already said, i.e. `was`.
    optimistic.delete(k);
    persistHint();
    notify();
  })();

  return next;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  loadFromServer();
  return () => {
    listeners.delete(listener);
  };
}
