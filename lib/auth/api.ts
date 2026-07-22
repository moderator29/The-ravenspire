"use client";

import { getAccessToken } from "@privy-io/react-auth";

/* Fetch a server route with the caller's Privy token attached. */
export async function realmFetch<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: boolean; status: number; data: T | null }> {
  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch {
    token = null;
  }
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}
