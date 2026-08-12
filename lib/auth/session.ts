"use client";

/* Client-side memory of a citizen's entry, so the realm carries them in
   even when the server (service role, Privy secret) is not configured.
   The server remains the source of truth when it is reachable. */

const ONBOARDED = "rvn_onboarded";
const HANDLE = "rvn_handle";
const HOUSE = "rvn_house";

export function isOnboardedLocal(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED) === "1";
}

export function markOnboardedLocal(handle?: string, house?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDED, "1");
  if (handle) localStorage.setItem(HANDLE, handle);
  if (house) localStorage.setItem(HOUSE, house);
}

export function clearOnboardedLocal() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDED);
  localStorage.removeItem(HANDLE);
  localStorage.removeItem(HOUSE);
}

export function localHandle(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HANDLE);
}

export function localHouse(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HOUSE);
}
