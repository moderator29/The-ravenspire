"use client";

import { getAccessToken } from "@privy-io/react-auth";

/* Fetch a server route with the caller's Privy token attached.
 *
 * NEVER THROWS. Every call site in the product reads the result as
 * `{ ok, status, data }` and none of them wrap the call in a try/catch,
 * because that shape is realmFetch's whole contract: check `res.ok`, never
 * catch an exception. `fetch()` itself was the one line here that could still
 * break that promise. A same-origin request to our own API route almost
 * never rejects, but it does the moment a device truly has no connection
 * (offline, a dead tunnel, a subway, a flight), and on the one page every
 * member opens most, the Ravenry, that meant a feed load thrown from inside
 * a bare `useEffect` with no boundary catching it: a blank screen with no
 * skeleton, no empty state and no error, forever, on the exact class of
 * network failure a mobile-first product should expect constantly. Status 0
 * is the conventional "no real HTTP response happened" marker, so a caller
 * checking `res.ok` (false) or `res.status` still gets an honest answer. */
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
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body });
  } catch {
    return { ok: false, status: 0, data: null };
  }
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/* The same authenticated request, for the one shape of call realmFetch
   cannot serve: a caller that reads the response body itself rather than
   waiting for it to finish and parsing it as one JSON value, which is the
   whole point of a streamed reply (Server-Sent Events from /api/raven). No
   status/data envelope here, because there is no single "the response" to
   report on until the stream the caller is about to read has ended; null
   on the same network failure realmFetch turns into `status: 0`. */
export async function realmFetchStream(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<Response | null> {
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
  try {
    return await fetch(path, { ...init, headers, body });
  } catch {
    return null;
  }
}
