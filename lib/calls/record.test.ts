import { describe, it, expect } from "vitest";
import {
  confidenceCheck,
  summarizeRecord,
  type RecordEntry,
} from "@/lib/calls/record";

/* The record is the one thing about a member the Herald must never be asked to
   produce, so it is computed here and handed over. These tests pin the two
   claims that matter: an empty record says nothing rather than saying zero, and
   the confidence check reads the member's own band rather than their average. */

function entry(overrides: Partial<RecordEntry> = {}): RecordEntry {
  return {
    category: "markets",
    bucket: "ticker:NAKA|up|0.2|24h",
    subject: "ticker:NAKA",
    confidence: 0.8,
    verdict: "hit",
    hit: true,
    ...overrides,
  };
}

const FOCUS = {
  category: "markets" as const,
  bucket: "ticker:NAKA|up|0.2|24h",
  subject: "ticker:NAKA",
  confidence: 0.8,
};

describe("summarizeRecord", () => {
  it("has no hit rate at all when nothing has settled", () => {
    const record = summarizeRecord([], FOCUS);
    expect(record.settled.total).toBe(0);
    expect(record.settled.hitRate).toBeNull();
    expect(record.confidence).toBeNull();
    expect(record.score).toBe(0);
  });

  it("counts open Calls without letting them touch the hit rate", () => {
    const record = summarizeRecord(
      [
        entry({ verdict: "open", hit: false }),
        entry({ verdict: "open", hit: false }),
        entry({ verdict: "hit", hit: true }),
      ],
      FOCUS
    );
    expect(record.open).toBe(2);
    expect(record.settled.total).toBe(1);
    expect(record.settled.hitRate).toBe(1);
  });

  it("ignores a void verdict, which was never judged", () => {
    const record = summarizeRecord(
      [entry({ verdict: "void", hit: false }), entry({ verdict: "miss", hit: false })],
      FOCUS
    );
    expect(record.settled.total).toBe(1);
    expect(record.settled.hits).toBe(0);
  });

  it("slices the record by category, subject and exact claim", () => {
    const record = summarizeRecord(
      [
        entry(),
        entry({ verdict: "miss", hit: false }),
        /* Same coin, different claim. */
        entry({ bucket: "ticker:NAKA|down|0.05|7d", verdict: "miss", hit: false }),
        /* Different coin, same category. */
        entry({ bucket: "ticker:PEPE|up|0.2|24h", subject: "ticker:PEPE" }),
        /* Another category entirely. */
        entry({
          category: "esports",
          bucket: null,
          subject: null,
          verdict: "miss",
          hit: false,
        }),
      ],
      FOCUS
    );

    expect(record.settled.total).toBe(5);
    expect(record.category.total).toBe(4);
    expect(record.subject.total).toBe(3);
    expect(record.claim.total).toBe(2);
    expect(record.claim.hits).toBe(1);
    expect(record.claim.hitRate).toBe(0.5);
  });

  it("leaves the claim and subject slices empty when the draft has neither", () => {
    const record = summarizeRecord([entry()], {
      ...FOCUS,
      bucket: null,
      subject: null,
    });
    expect(record.claim.total).toBe(0);
    expect(record.subject.total).toBe(0);
    expect(record.category.total).toBe(1);
  });

  it("shrinks the ranked score so a short winning record is not a proven one", () => {
    const perfect = summarizeRecord(
      [entry(), entry(), entry()],
      FOCUS
    );
    /* Three hits out of three is 3/23, not 1. */
    expect(perfect.score).toBeCloseTo(3 / 23, 10);
  });
});

describe("confidenceCheck", () => {
  it("reads the band the stated confidence falls in, not the average", () => {
    const points = [
      /* Four Calls at 60 percent, three landed. */
      { confidence: 0.6, hit: true },
      { confidence: 0.6, hit: true },
      { confidence: 0.65, hit: true },
      { confidence: 0.6, hit: false },
      /* Four at 90 percent, one landed. */
      { confidence: 0.9, hit: true },
      { confidence: 0.9, hit: false },
      { confidence: 0.92, hit: false },
      { confidence: 0.9, hit: false },
    ];

    const low = confidenceCheck(points, 0.62);
    expect(low?.total).toBe(4);
    expect(low?.realized).toBe(0.75);
    expect(low?.gap).toBeLessThan(0.05);

    const high = confidenceCheck(points, 0.91);
    expect(high?.total).toBe(4);
    expect(high?.realized).toBe(0.25);
    /* Stated about 0.905 against a realized 0.25: real, measured overconfidence. */
    expect(high?.gap).toBeGreaterThan(0.6);
  });

  it("says nothing about a band the member has never settled a Call in", () => {
    const points = [{ confidence: 0.6, hit: true }];
    expect(confidenceCheck(points, 0.95)).toBeNull();
  });

  it("says nothing at all with no settled Calls", () => {
    expect(confidenceCheck([], 0.8)).toBeNull();
  });

  it("places the top of the scale inside the last band", () => {
    const points = [
      { confidence: 0.99, hit: true },
      { confidence: 0.99, hit: false },
    ];
    const band = confidenceCheck(points, 0.99);
    expect(band?.from).toBe(0.99);
    expect(band?.total).toBe(2);
    expect(band?.realized).toBe(0.5);
  });
});
