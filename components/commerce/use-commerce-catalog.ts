"use client";

import { useEffect, useState } from "react";

/* The catalog, read once per page and shared by every buy control on it.
 *
 * Five chests and merch tiles on one screen must not be five requests asking
 * the same question. The read is cached in module scope for the life of the
 * page, and the in-flight promise is cached too, so controls mounting in the
 * same tick share one request rather than racing each other.
 *
 * Deliberately not a context provider. A provider would have to be threaded
 * through the two server-rendered pages that carry these controls, and the
 * thing being shared is a single immutable read, not state anybody mutates.
 */

export type CatalogChest = { sku: string; priceMinor: number; floorMinor: number };
export type CatalogMerch = { sku: string; priceMinor: number };

export type CommerceCatalog =
  | { state: "loading"; live: { chests: boolean; mercer: boolean }; confirmed: false }
  | {
      state: "ready";
      live: { chests: boolean; mercer: boolean };
      confirmed: false;
    }
  | {
      state: "ready";
      live: { chests: boolean; mercer: boolean };
      confirmed: true;
      chests: CatalogChest[];
      merch: CatalogMerch[];
    };

type Payload = {
  confirmed?: boolean;
  live?: { chests?: boolean; mercer?: boolean };
  chests?: CatalogChest[];
  merch?: CatalogMerch[];
};

/* Sealed and unpriced is the safe reading of every failure: a network error
   must never open a shop or invent a price. */
const SEALED: CommerceCatalog = {
  state: "ready",
  live: { chests: false, mercer: false },
  confirmed: false,
};

let cached: CommerceCatalog | null = null;
let inFlight: Promise<CommerceCatalog> | null = null;

async function read(): Promise<CommerceCatalog> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      /* No auth needed: the catalog says what is open and, once confirmed,
         what things cost. Both are public facts by the time they exist. */
      const res = await fetch("/api/commerce/catalog");
      const data = (await res.json()) as Payload;
      const live = {
        chests: data.live?.chests === true,
        mercer: data.live?.mercer === true,
      };
      cached = data.confirmed
        ? {
            state: "ready",
            live,
            confirmed: true,
            chests: data.chests ?? [],
            merch: data.merch ?? [],
          }
        : { state: "ready", live, confirmed: false };
      return cached;
    } catch {
      cached = SEALED;
      return cached;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function useCommerceCatalog(): CommerceCatalog {
  const [catalog, setCatalog] = useState<CommerceCatalog>(
    cached ?? { state: "loading", live: { chests: false, mercer: false }, confirmed: false }
  );

  useEffect(() => {
    let cancelled = false;
    void read().then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return catalog;
}
