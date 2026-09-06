"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* The Vault's local passcode lock: a Trust Wallet style app lock layered on
   top of a login Privy has already verified, not a second custody boundary.
   Privy is what actually protects the embedded wallet; this is a screen lock
   for the device it lives on, so a phone left unattended on the Ravenry does
   not leave balances and send controls sitting open on the same screen a
   stranger could pick up. The passcode is hashed (SHA-256) before it ever
   touches storage, and nothing here can move funds, which is also why a
   forgotten passcode resets rather than traps a member outside their own
   wallet: see `reset` below.

   Keyed the same way components/wallet/wallet-prefs.ts keys its own local
   state, by the member's 0x address, falling back to a shared "anon" bucket
   before it resolves. That fallback is an accepted, pre-existing tradeoff in
   this file's sibling, not a new one introduced here. */

const INACTIVITY_MS = 30 * 60 * 1000;
const TOUCH_THROTTLE_MS = 10_000;

interface LockRecord {
  hash: string | null;
  skipped: boolean;
  lastActivityAt: number;
}

const DEFAULT_RECORD: LockRecord = {
  hash: null,
  skipped: false,
  lastActivityAt: 0,
};

function keyFor(addr: string | undefined): string {
  return `vault:lock:${(addr ?? "anon").toLowerCase()}`;
}

function read(addr: string | undefined): LockRecord {
  if (typeof window === "undefined") return DEFAULT_RECORD;
  try {
    const raw = window.localStorage.getItem(keyFor(addr));
    if (!raw) return DEFAULT_RECORD;
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    return {
      hash: typeof parsed.hash === "string" ? parsed.hash : null,
      skipped: Boolean(parsed.skipped),
      lastActivityAt:
        typeof parsed.lastActivityAt === "number" ? parsed.lastActivityAt : 0,
    };
  } catch {
    return DEFAULT_RECORD;
  }
}

function write(addr: string | undefined, record: LockRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(addr), JSON.stringify(record));
  } catch {
    /* storage full or unavailable; stay quiet */
  }
}

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type VaultLockStatus = "checking" | "welcome" | "locked" | "unlocked";

export function useVaultLock(address: string | undefined) {
  const [record, setRecord] = useState<LockRecord | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const lastWriteRef = useRef(0);

  /* Re-read whenever the address settles (anon -> real address, or a member
     switches accounts). A record with no hash is never locked, whether it
     was skipped or simply never visited yet. */
  useEffect(() => {
    const rec = read(address);
    setRecord(rec);
    setUnlocked(
      rec.hash === null || Date.now() - rec.lastActivityAt < INACTIVITY_MS
    );
  }, [address]);

  const touch = useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current < TOUCH_THROTTLE_MS) return;
    lastWriteRef.current = now;
    write(address, { ...read(address), lastActivityAt: now });
  }, [address]);

  /* Auto re-lock after 30 idle minutes, and refresh the activity clock on
     real interaction so a member mid-send is never locked out under them. */
  useEffect(() => {
    if (!unlocked || !record?.hash) return;
    const checkIdle = () => {
      const rec = read(address);
      if (Date.now() - rec.lastActivityAt >= INACTIVITY_MS) {
        setUnlocked(false);
      }
    };
    const onActivity = () => touch();
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", checkIdle);
    const id = window.setInterval(checkIdle, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", checkIdle);
      window.clearInterval(id);
    };
  }, [unlocked, record?.hash, address, touch]);

  const setup = useCallback(
    async (pin: string) => {
      const hash = await hashPin(pin);
      const rec: LockRecord = {
        hash,
        skipped: false,
        lastActivityAt: Date.now(),
      };
      write(address, rec);
      setRecord(rec);
      setUnlocked(true);
    },
    [address]
  );

  const skipSetup = useCallback(() => {
    const rec: LockRecord = { hash: null, skipped: true, lastActivityAt: Date.now() };
    write(address, rec);
    setRecord(rec);
    setUnlocked(true);
  }, [address]);

  const verify = useCallback(
    async (pin: string) => {
      const rec = read(address);
      const hash = await hashPin(pin);
      const ok = hash === rec.hash;
      if (ok) {
        const next = { ...rec, lastActivityAt: Date.now() };
        write(address, next);
        setRecord(next);
        setUnlocked(true);
      }
      return ok;
    },
    [address]
  );

  const lockNow = useCallback(() => setUnlocked(false), []);

  const removePasscode = useCallback(() => {
    const rec: LockRecord = { hash: null, skipped: true, lastActivityAt: Date.now() };
    write(address, rec);
    setRecord(rec);
    setUnlocked(true);
  }, [address]);

  /* No secret is actually protected here (see the header comment), so a
     forgotten passcode clears it rather than trapping a member outside their
     own funds. They can set a fresh one in Settings whenever they choose. */
  const reset = removePasscode;

  const status: VaultLockStatus =
    record === null
      ? "checking"
      : record.hash === null && !record.skipped
        ? "welcome"
        : !unlocked
          ? "locked"
          : "unlocked";

  return {
    status,
    hasPasscode: record?.hash != null,
    setup,
    skipSetup,
    verify,
    lockNow,
    removePasscode,
    reset,
  };
}
