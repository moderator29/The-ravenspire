import { describe, it, expect, vi, beforeEach } from "vitest";

/* checkAndGrantCrests reads profiles and writes notifications, none of which
   these tests are about. Stubbed so award() can be exercised as the economy
   entry point it is. */
vi.mock("@/lib/crests", () => ({
  checkAndGrantCrests: vi.fn(async () => {}),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAILY_SOCIAL_RENOWN_CAP,
  TIERS,
  award,
  tierFor,
} from "@/lib/points";
import { checkAndGrantCrests } from "@/lib/crests";

/* The points economy is server-authoritative and irreversible: once a ledger
   row is written and the totals RPC has run, nothing walks it back. These tests
   cover the tier ladder and the routing decision award() makes between the
   uncapped path and the daily social allowance. */

interface Recorded {
  inserts: { table: string; row: Record<string, unknown> }[];
  rpcs: { name: string; args: Record<string, unknown> }[];
}

/* A Supabase double recording exactly the two things award() can do: insert a
   ledger row, and call an RPC. */
function fakeDb(rpcResults: Record<string, unknown> = {}): {
  db: SupabaseClient;
  recorded: Recorded;
} {
  const recorded: Recorded = { inserts: [], rpcs: [] };
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          recorded.inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      recorded.rpcs.push({ name, args });
      return Promise.resolve({
        data: name in rpcResults ? rpcResults[name] : null,
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  return { db, recorded };
}

const PROFILE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(checkAndGrantCrests).mockClear();
});

describe("tierFor", () => {
  it("starts everyone at Smallfolk", () => {
    expect(tierFor(0).slug).toBe("smallfolk");
    expect(tierFor(99).slug).toBe("smallfolk");
  });

  it("promotes exactly at each threshold, never one short of it", () => {
    for (const tier of TIERS) {
      expect(tierFor(tier.min).slug).toBe(tier.slug);
      if (tier.min > 0) {
        expect(tierFor(tier.min - 1).slug).not.toBe(tier.slug);
      }
    }
  });

  it("matches the ladder the SQL mirrors", () => {
    /* increment_profile_totals, apply_call_score and award_social_capped each
       carry this ladder in SQL. If it drifts from the TypeScript one, a member
       sees a different tier depending on which path awarded them. */
    const expected: [number, string][] = [
      [0, "smallfolk"],
      [100, "squire"],
      [400, "knight"],
      [1200, "lord"],
      [3000, "warden"],
      [7000, "hand"],
      [15000, "king"],
    ];
    expect(TIERS.map((t) => [t.min, t.slug])).toEqual(expected);
  });

  it("never demotes as renown grows", () => {
    let highest = -1;
    for (let renown = 0; renown <= 20000; renown += 37) {
      const index = TIERS.findIndex((t) => t.slug === tierFor(renown).slug);
      expect(index).toBeGreaterThanOrEqual(highest);
      highest = index;
    }
  });

  it("caps at the top of the ladder", () => {
    expect(tierFor(1_000_000).slug).toBe("king");
  });
});

describe("award: the uncapped path", () => {
  it("does nothing at all for a zero award", async () => {
    const { db, recorded } = fakeDb();
    const result = await award(db, PROFILE, { points: 0, glory: 0, reason: "noop" });
    expect(result).toEqual({ points: 0, glory: 0, capped: false });
    expect(recorded.inserts).toHaveLength(0);
    expect(recorded.rpcs).toHaveLength(0);
  });

  it("writes the ledger before touching the totals", async () => {
    /* The ledger is the source of truth and the totals are a cache, so the
       ledger row has to exist first: a crash between the two must leave a
       recoverable record, not an unexplained balance. */
    const { db, recorded } = fakeDb();
    await award(db, PROFILE, { points: 40, glory: 25, reason: "call_hit", ref: "post-1" });
    expect(recorded.inserts[0].table).toBe("points_ledger");
    expect(recorded.inserts[0].row).toMatchObject({
      profile_id: PROFILE,
      points_delta: 40,
      glory_delta: 25,
      reason: "call_hit",
      ref: "post-1",
    });
    expect(recorded.rpcs[0].name).toBe("increment_profile_totals");
  });

  it("increments totals atomically rather than reading and writing back", async () => {
    const { db, recorded } = fakeDb();
    await award(db, PROFILE, { points: 8, glory: 2, reason: "sealed_a_call" });
    expect(recorded.rpcs[0]).toEqual({
      name: "increment_profile_totals",
      args: { p_profile_id: PROFILE, p_points: 8, p_glory: 2 },
    });
  });

  it("bumps House Glory only when Glory was actually awarded", async () => {
    const withHouse = fakeDb({ increment_profile_totals: "emberfall" });
    await award(withHouse.db, PROFILE, { points: 5, glory: 2, reason: "sent_a_raven" });
    expect(withHouse.recorded.rpcs.map((r) => r.name)).toEqual([
      "increment_profile_totals",
      "increment_house_glory",
    ]);
    expect(withHouse.recorded.rpcs[1].args).toEqual({
      p_slug: "emberfall",
      p_glory: 2,
    });

    const pointsOnly = fakeDb({ increment_profile_totals: "emberfall" });
    await award(pointsOnly.db, PROFILE, { points: 20, reason: "banner_answered" });
    expect(pointsOnly.recorded.rpcs.map((r) => r.name)).toEqual([
      "increment_profile_totals",
    ]);
  });

  it("does not bump House Glory for a member with no House", async () => {
    const { db, recorded } = fakeDb({ increment_profile_totals: null });
    await award(db, PROFILE, { points: 5, glory: 2, reason: "sent_a_raven" });
    expect(recorded.rpcs.map((r) => r.name)).toEqual(["increment_profile_totals"]);
  });

  it("checks for new crests after the totals have moved", async () => {
    const { db } = fakeDb();
    await award(db, PROFILE, { points: 400, reason: "call_hit" });
    expect(checkAndGrantCrests).toHaveBeenCalledWith(db, PROFILE);
  });

  it("leaves a resolved Call uncapped", async () => {
    /* Section 9.5, rule 4, second half. A Call costs a scarce open-Call slot
       and is scored against a difficulty baseline, so it does not draw on the
       social allowance and must never route through the capped RPC. */
    const { db, recorded } = fakeDb();
    const result = await award(db, PROFILE, {
      points: 40,
      glory: 25,
      reason: "call_hit",
      category: "call",
    });
    expect(recorded.rpcs.map((r) => r.name)).toEqual(["increment_profile_totals"]);
    expect(recorded.inserts[0].row.category).toBe("call");
    expect(result).toEqual({ points: 40, glory: 25, capped: false });
  });
});

describe("award: the daily social allowance", () => {
  it("routes a social award through the atomic capped RPC and nothing else", async () => {
    /* The read of the day's total and the write of the ledger row have to be
       one statement. If award() ever went back to inserting the ledger row
       itself for a social action, two concurrent likes would both see room and
       both spend it, which is exactly the collusion path the cap closes. */
    const { db, recorded } = fakeDb({
      award_social_capped: { points: 1, glory: 0, capped: false },
    });
    await award(db, PROFILE, {
      points: 1,
      reason: "liked_by_someone",
      ref: "post-9",
      category: "social",
    });
    expect(recorded.inserts).toHaveLength(0);
    expect(recorded.rpcs).toHaveLength(1);
    expect(recorded.rpcs[0]).toEqual({
      name: "award_social_capped",
      args: {
        p_profile_id: PROFILE,
        p_points: 1,
        p_glory: 0,
        p_reason: "liked_by_someone",
        p_ref: "post-9",
        p_daily_cap: DAILY_SOCIAL_RENOWN_CAP,
      },
    });
  });

  it("reports what was actually granted, not what was requested", async () => {
    const { db } = fakeDb({
      award_social_capped: { points: 3, glory: 0, capped: true },
    });
    const result = await award(db, PROFILE, {
      points: 8,
      glory: 2,
      reason: "sealed_a_call",
      category: "social",
    });
    expect(result).toEqual({ points: 3, glory: 0, capped: true });
  });

  it("skips the crest check when the allowance granted nothing", async () => {
    const { db } = fakeDb({
      award_social_capped: { points: 0, glory: 0, capped: true },
    });
    const result = await award(db, PROFILE, {
      points: 5,
      glory: 2,
      reason: "sent_a_raven",
      category: "social",
    });
    expect(result).toEqual({ points: 0, glory: 0, capped: true });
    expect(checkAndGrantCrests).not.toHaveBeenCalled();
  });

  it("grants nothing when the capped RPC fails, rather than falling back to uncapped", async () => {
    /* Failing open here would turn any error into an uncapped mint. */
    const recorded: Recorded = { inserts: [], rpcs: [] };
    const db = {
      from(table: string) {
        return {
          insert(row: Record<string, unknown>) {
            recorded.inserts.push({ table, row });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      rpc(name: string, args: Record<string, unknown>) {
        recorded.rpcs.push({ name, args });
        return Promise.resolve({ data: null, error: { message: "boom" } });
      },
    } as unknown as SupabaseClient;

    const result = await award(db, PROFILE, {
      points: 1,
      reason: "liked_by_someone",
      category: "social",
    });
    expect(result).toEqual({ points: 0, glory: 0, capped: false });
    expect(recorded.inserts).toHaveLength(0);
    expect(recorded.rpcs.map((r) => r.name)).toEqual(["award_social_capped"]);
  });

  it("sets a cap a real member never reaches and a farm reaches within the hour", async () => {
    /* One like is one point of Renown. The cap is a ceiling on collusion, not
       a budget an ordinary member has to think about. */
    expect(DAILY_SOCIAL_RENOWN_CAP).toBeGreaterThan(100);
    expect(DAILY_SOCIAL_RENOWN_CAP).toBeLessThan(1000);
  });
});
