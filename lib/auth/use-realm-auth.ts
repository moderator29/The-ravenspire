"use client";

import { useRealmAuthContext } from "@/lib/auth/realm-auth-context";

/* The one hook the app uses for auth state and actions. Works with or
   without the Gatehouse (Privy) keys configured; without them it reports
   enabled:false and the UI degrades honestly. */
export function useRealmAuth() {
  return useRealmAuthContext();
}
