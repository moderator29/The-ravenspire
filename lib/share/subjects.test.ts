import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readCallSubject,
  readCrestSubject,
  readKeepSubject,
  readProofSubject,
} from "@/lib/share/subjects";

/* THE PRIVACY BOUNDARY, DRIVEN.
 *
 * lib/share/subjects.ts decides what leaves the realm inside an image anybody
 * can fetch by guessing a URL, and every claim it makes about a gate is worth
 * exactly as much as a test that has watched the gate fire. The cases below are
 * the four that would actually hurt:
 *
 *   a sealed Hoard appearing in a PNG,
 *   a removed member still being distributed by the product that removed them,
 *   a restricted Call publishing its own words and its own audience limit,
 *   a crest nobody earned rendering as though somebody had.
 *
 * The stub is a hand written query-builder double rather than a mock library.
 * It records the table and the filters so a test can assert on what was asked
 * for, and it deliberately supports only the handful of calls the readers make:
 * a stub that answered anything would let the module drift into a query nobody
 * has thought about.
 */

type Row = Record<string, unknown>;

type TableData = {
  rows: Row[];
  /* An error the table answers with, for the "not migrated yet" paths. */
  error?: { code: string };
};

function stubDb(tables: Record<string, TableData>) {
  const asked: { table: string; filters: [string, unknown][] }[] = [];

  function builder(table: string) {
    const filters: [string, unknown][] = [];
    const notNull: string[] = [];
    asked.push({ table, filters });

    const match = () => {
      const data = tables[table];
      if (!data) return { rows: [] as Row[], error: undefined };
      if (data.error) return { rows: [] as Row[], error: data.error };
      const rows = data.rows.filter(
        (row) =>
          filters.every(([col, val]) => row[col] === val) &&
          notNull.every((col) => row[col] !== null && row[col] !== undefined)
      );
      return { rows, error: undefined };
    };

    /* A head+count select resolves through the same terminal `then` as any
       other awaited builder, and answers a count instead of rows, exactly as
       PostgREST does. Tracked as a flag rather than by returning a different
       object, because the filters that follow it have to land on the same
       builder: the first draft returned a copy and every `.eq()` after the
       `.select()` went to the original, so a count came back unfiltered. */
    let head = false;

    const api = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push([col, vals[0]]);
        return api;
      },
      not(col: string) {
        notNull.push(col);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        const { rows, error } = match();
        return Promise.resolve({ data: rows, error: error ?? null });
      },
      maybeSingle() {
        const { rows, error } = match();
        return Promise.resolve({ data: rows[0] ?? null, error: error ?? null });
      },
      then(resolve: (v: unknown) => unknown) {
        const { rows, error } = match();
        return Promise.resolve(
          resolve(
            head
              ? { data: null, error: error ?? null, count: rows.length }
              : { data: rows, error: error ?? null }
          )
        );
      },
    };
    return api;
  }

  const db = { from: (table: string) => builder(table) };
  return { db: db as unknown as SupabaseClient, asked };
}

const PROFILE = {
  id: "p1",
  handle: "ravenlord",
  display_name: "Raven Lord",
  tier: "Knight",
  renown: 420,
  glory: 99,
  house_slug: "corvane",
  settings: null as unknown,
  is_banned: false,
};

const EMPTY_TABLES = {
  posts: { rows: [] },
  user_crests: { rows: [] },
  inventory: { rows: [] },
};

describe("readKeepSubject", () => {
  it("returns the public standing for an ordinary member", async () => {
    const { db } = stubDb({ profiles: { rows: [PROFILE] }, ...EMPTY_TABLES });
    const keep = await readKeepSubject("ravenlord", db);
    expect(keep).not.toBeNull();
    expect(keep?.handle).toBe("ravenlord");
    expect(keep?.renown).toBe(420);
    expect(keep?.glory).toBe(99);
    expect(keep?.houseName).toBe("House Corvane");
  });

  it("carries no balance, no points and no wallet, whatever the settings say", async () => {
    /* Stricter than the API on purpose: an image at a guessable URL is the
       wrong place for a number that says what somebody is worth. */
    const { db } = stubDb({
      profiles: {
        rows: [
          {
            ...PROFILE,
            points: 100000,
            wallet_address: "0xdeadbeef",
            settings: { privacy: { pnlVisible: true, publicPositions: true } },
          },
        ],
      },
      ...EMPTY_TABLES,
    });
    const keep = await readKeepSubject("ravenlord", db);
    const json = JSON.stringify(keep);
    expect(json).not.toContain("0xdeadbeef");
    expect(json).not.toContain("100000");
    expect(Object.keys(keep ?? {})).not.toContain("points");
    expect(Object.keys(keep ?? {})).not.toContain("walletAddress");
  });

  it("seals the Hoard when the member has sealed it", async () => {
    const inventory = {
      rows: [
        {
          id: "c1",
          profile_id: "p1",
          set_slug: "set-one",
          card_number: 1,
          champion_slug: "unknown-champion",
          rarity: "rare",
          source: "chest",
          acquired_at: "2026-01-01T00:00:00Z",
        },
      ],
    };

    const open = stubDb({
      profiles: { rows: [PROFILE] },
      ...EMPTY_TABLES,
      inventory,
      collectible_claims: { rows: [] },
      market_listings: { rows: [] },
    });
    expect((await readKeepSubject("ravenlord", open.db))?.hoard).not.toBeNull();

    const sealed = stubDb({
      profiles: {
        rows: [{ ...PROFILE, settings: { privacy: { hoardVisible: false } } }],
      },
      ...EMPTY_TABLES,
      inventory,
      collectible_claims: { rows: [] },
      market_listings: { rows: [] },
    });
    const keep = await readKeepSubject("ravenlord", sealed.db);
    expect(keep).not.toBeNull();
    expect(keep?.hoard).toBeNull();
    /* The gate has to fire BEFORE the read, not after: a sealed collection
       that is fetched and then discarded is one refactor away from being
       fetched and then rendered. */
    expect(sealed.asked.some((q) => q.table === "inventory")).toBe(false);
  });

  it("shows no Hoard for a member who holds nothing, rather than a zero", async () => {
    const { db } = stubDb({
      profiles: { rows: [PROFILE] },
      ...EMPTY_TABLES,
      collectible_claims: { rows: [] },
      market_listings: { rows: [] },
    });
    expect((await readKeepSubject("ravenlord", db))?.hoard).toBeNull();
  });

  it("refuses a removed member", async () => {
    const { db } = stubDb({
      profiles: { rows: [{ ...PROFILE, is_banned: true }] },
      ...EMPTY_TABLES,
    });
    expect(await readKeepSubject("ravenlord", db)).toBeNull();
  });

  it("refuses a handle nobody holds", async () => {
    const { db } = stubDb({ profiles: { rows: [] }, ...EMPTY_TABLES });
    expect(await readKeepSubject("nobody", db)).toBeNull();
  });

  it("matches the handle lowercased, so display casing resolves", async () => {
    const { db } = stubDb({ profiles: { rows: [PROFILE] }, ...EMPTY_TABLES });
    expect(await readKeepSubject("RavenLord", db)).not.toBeNull();
  });

  it("counts only settled Calls, and never invents a record", async () => {
    const { db } = stubDb({
      profiles: { rows: [PROFILE] },
      posts: {
        rows: [
          { author_id: "p1", kind: "call", deleted: false, call: { verdict: "hit" } },
          { author_id: "p1", kind: "call", deleted: false, call: { verdict: "hit" } },
          { author_id: "p1", kind: "call", deleted: false, call: { verdict: "miss" } },
          { author_id: "p1", kind: "call", deleted: false, call: { verdict: "open" } },
          { author_id: "p1", kind: "call", deleted: false, call: null },
        ],
      },
      user_crests: { rows: [] },
    });
    const keep = await readKeepSubject("ravenlord", db);
    expect(keep?.callsWon).toBe(2);
    expect(keep?.callsLost).toBe(1);
  });
});

describe("readCallSubject", () => {
  const CALL = {
    id: "c1",
    kind: "call",
    deleted: false,
    visibility: "public",
    call: {
      token: "rsp",
      stance: "up",
      verdict: "hit",
      score: 40,
      confidence: 0.8,
      threshold: 0.25,
      rationale: "The chart says so.",
    },
    author: { handle: "ravenlord", display_name: "Raven Lord" },
  };

  it("reads a settled, public Call", async () => {
    const { db } = stubDb({ posts: { rows: [CALL] } });
    const call = await readCallSubject("c1", db);
    expect(call?.token).toBe("RSP");
    expect(call?.stance).toBe("UP");
    expect(call?.verdict).toBe("hit");
    expect(call?.score).toBe(40);
    expect(call?.confidence).toBe(80);
    expect(call?.threshold).toBe(25);
  });

  it("shows a miss as a miss", async () => {
    /* A card that only unfurled flatteringly would be a highlight reel, and a
       highlight reel is worth nothing as evidence. */
    const { db } = stubDb({
      posts: { rows: [{ ...CALL, call: { ...CALL.call, verdict: "miss" } }] },
    });
    expect((await readCallSubject("c1", db))?.verdict).toBe("miss");
  });

  it("refuses a Call that is not public", async () => {
    for (const visibility of ["followers", "house", "private", null]) {
      const { db } = stubDb({ posts: { rows: [{ ...CALL, visibility }] } });
      expect(await readCallSubject("c1", db), String(visibility)).toBeNull();
    }
  });

  it("refuses a deleted Call", async () => {
    const { db } = stubDb({ posts: { rows: [{ ...CALL, deleted: true }] } });
    expect(await readCallSubject("c1", db)).toBeNull();
  });

  it("carries no score at all while a Call is still open", async () => {
    const { db } = stubDb({
      posts: {
        rows: [
          {
            ...CALL,
            call: { token: "rsp", stance: "up", verdict: "open" },
          },
        ],
      },
    });
    const call = await readCallSubject("c1", db);
    expect(call?.verdict).toBe("open");
    expect(call?.score).toBeNull();
  });
});

describe("readCrestSubject", () => {
  it("refuses a crest the member does not hold", async () => {
    /* The one that would let anybody manufacture a convincing image of
       somebody else holding something they never earned. */
    const { db } = stubDb({
      profiles: { rows: [PROFILE] },
      user_crests: { rows: [] },
    });
    expect(
      await readCrestSubject("ravenlord", "knight-of-the-realm", db)
    ).toBeNull();
  });

  it("refuses a crest that is not in the catalogue", async () => {
    const { db } = stubDb({
      profiles: { rows: [PROFILE] },
      user_crests: { rows: [{ profile_id: "p1", crest_slug: "invented-crest" }] },
    });
    expect(await readCrestSubject("ravenlord", "invented-crest", db)).toBeNull();
  });

  it("refuses a removed member who does hold it", async () => {
    const { db } = stubDb({
      profiles: { rows: [{ ...PROFILE, is_banned: true }] },
      user_crests: {
        rows: [{ profile_id: "p1", crest_slug: "knight-of-the-realm" }],
      },
    });
    expect(
      await readCrestSubject("ravenlord", "knight-of-the-realm", db)
    ).toBeNull();
  });

  it("reads a crest that is genuinely held", async () => {
    const { db } = stubDb({
      profiles: { rows: [PROFILE] },
      user_crests: {
        rows: [
          {
            profile_id: "p1",
            crest_slug: "knight-of-the-realm",
            earned_at: "2026-02-02T00:00:00Z",
          },
        ],
      },
    });
    const crest = await readCrestSubject("ravenlord", "knight-of-the-realm", db);
    expect(crest?.crestName).toBe("Knight of the Realm");
    expect(crest?.holderHandle).toBe("ravenlord");
    expect(crest?.holders).toBe(1);
  });
});

describe("readProofSubject", () => {
  const OPENING = {
    id: "o1",
    profile_id: "p1",
    chest_sku: "knights-warchest",
    opened_at: "2026-03-03T00:00:00Z",
    server_seed: "revealed",
    server_seed_hash: "abcdef0123456789abcdef",
    result: { cards: [{ champion_slug: "x", rarity: "rare" }] },
  };

  it("reads a settled opening", async () => {
    const { db } = stubDb({ chest_openings: { rows: [OPENING] } });
    const proof = await readProofSubject("o1", db);
    expect(proof?.chestName).toBe("Knight's Warchest");
    expect(proof?.cards).toBe(1);
    expect(proof?.commitment).toBe("abcdef012345");
  });

  it("never carries anything that leads back to a member", async () => {
    /* An opening proves the house dealt these cards under this seed. It does
       not say whose Hoard they landed in, and this is the most public
       projection of that row in the product. */
    const { db } = stubDb({ chest_openings: { rows: [OPENING] } });
    const proof = await readProofSubject("o1", db);
    expect(JSON.stringify(proof)).not.toContain("p1");
    expect(Object.keys(proof ?? {})).not.toContain("profile_id");
  });

  it("refuses an opening whose seed has not been revealed", async () => {
    /* A live commitment in a share card would be advertising a chest nobody
       has opened yet, and would let a member predict every chest under it. */
    const { db } = stubDb({
      chest_openings: { rows: [{ ...OPENING, server_seed: null }] },
    });
    expect(await readProofSubject("o1", db)).toBeNull();
  });

  it("answers null rather than throwing when the chests are not migrated", async () => {
    const { db } = stubDb({
      chest_openings: { rows: [], error: { code: "42P01" } },
    });
    expect(await readProofSubject("o1", db)).toBeNull();
  });
});
