"use client";

import { realmFetch } from "@/lib/auth/api";

/* Client helpers for the persisted mute feature. Every call carries the
   caller's Privy token via realmFetch and is served by /api/mutes. */

/* Silence a member so their ravens no longer reach the caller. */
export async function muteMember(mutedId: string): Promise<boolean> {
  const res = await realmFetch("/api/mutes", {
    method: "POST",
    json: { muted_id: mutedId },
  });
  return res.ok;
}

/* Lift a silence previously placed on a member. */
export async function unmuteMember(mutedId: string): Promise<boolean> {
  const res = await realmFetch("/api/mutes", {
    method: "DELETE",
    json: { muted_id: mutedId },
  });
  return res.ok;
}

/* The set of profile ids the caller has silenced. */
export async function fetchMutedIds(): Promise<string[]> {
  const res = await realmFetch<{ muted?: string[] }>("/api/mutes");
  return res.data?.muted ?? [];
}
