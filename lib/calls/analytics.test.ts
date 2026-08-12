import { describe, it, expect } from "vitest";
import {
  CALIBRATION_EDGES,
  MAX_SOURCES,
  RANKED_MINIMUM,
  SHRINK,
  calibration,
  callProgress,
  difficultyBand,
  isPositive,
  normalizeSources,
  scoreOutlook,
  shrunkAccuracy,
  sourceLabel,
  streaks,
} from "@/lib/calls/analytics";
import { CONFIDENCE_MAX, SCORE_MAX, SCORE_MIN } from "@/lib/calls/scoring";

/* The record maths a member is judged and displayed by. Every function here
   ends up on a public prediction profile, so each one is asserted against the
   property the product claims it has rather than against a snapshot. */

describe("shrunkAccuracy", () => {
  it("divides a short lucky record by the shrinkage constant", () => {
    /* Three from three is not a 100% caller. */
    expect(shrunkAccuracy(3, 3)).toBeCloseTo(3 / 23, 10);
    expect(shrunkAccuracy(3, 3)).toBeLessThan(0.15);
  });

  it("lets a long honest record converge toward its true rate", () => {
    const long = shrunkAccuracy(120, 200);
    expect(long).toBeGreaterThan(0.5);
    expect(long).toBeLessThan(0.6);
  });

  it("ranks a long good record above a short perfect one", () => {
    expect(shrunkAccuracy(120, 200)).toBeGreaterThan(shrunkAccuracy(3, 3));
  });

  it("is zero with nothing settled, never NaN", () => {
    expect(shrunkAccuracy(0, 0)).toBe(0);
    expect(shrunkAccuracy(Number.NaN, 4)).toBe(0);
  });

  it("uses the constant the caller board ranks by", () => {
    expect(SHRINK).toBe(20);
    expect(RANKED_MINIMUM).toBe(25);
  });
});

describe("difficultyBand", () => {
  it("calls an even baseline a coin flip", () => {
    expect(difficultyBand(0.5).key).toBe("even");
    expect(difficultyBand(0.46).key).toBe("even");
  });

  it("grades harder as the baseline falls", () => {
    expect(difficultyBand(0.3).key).toBe("testing");
    expect(difficultyBand(0.15).key).toBe("hard");
    expect(difficultyBand(0.02).key).toBe("long-odds");
  });

  it("says so honestly when there is no baseline", () => {
    expect(difficultyBand(Number.NaN).label).toBe("Unrated");
  });
});

describe("scoreOutlook", () => {
  it("agrees with the worked figures in V2 section 9.2", () => {
    const even = scoreOutlook(0.7, 0.5);
    expect(even.ifHit).toBe(49);
    expect(even.ifMiss).toBe(-74);

    const hard = scoreOutlook(0.7, 0.1);
    expect(hard.ifHit).toBe(SCORE_MAX);
    expect(hard.ifMiss).toBe(SCORE_MIN);
  });

  it("scores nothing when the member states exactly the baseline", () => {
    const flat = scoreOutlook(0.6, 0.6);
    expect(flat.ifHit).toBe(0);
    expect(flat.ifMiss).toBe(0);
  });

  it("never shows negative Renown, because Renown is monotonic", () => {
    const bad = scoreOutlook(CONFIDENCE_MAX, 0.5);
    expect(bad.ifMiss).toBeLessThan(0);
    expect(bad.renownIfMiss).toBe(0);
    expect(bad.seasonIfMiss).toBe(bad.ifMiss);
  });
});

describe("streaks", () => {
  const positive = { score: 40, hit: true };
  const negative = { score: -30, hit: false };

  it("counts the run still standing and the best run ever", () => {
    const result = streaks([positive, positive, negative, positive, positive]);
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
    expect(result.onFire).toBe(true);
  });

  it("breaks the current run on a negative Call", () => {
    const result = streaks([positive, positive, positive, negative]);
    expect(result.current).toBe(0);
    expect(result.best).toBe(3);
    expect(result.onFire).toBe(false);
  });

  it("is empty with no settled Calls", () => {
    expect(streaks([])).toEqual({ current: 0, best: 0, onFire: false });
  });

  it("treats a Call that scored below its baseline as broken, even when it landed", () => {
    /* Being right about something easier than you claimed is not a positive
       Call, and the score is what says so. */
    expect(isPositive({ score: -12, hit: true })).toBe(false);
    expect(isPositive({ score: 0, hit: true })).toBe(false);
  });

  it("falls back to the verdict for a row sealed before V2 froze a baseline", () => {
    expect(isPositive({ hit: true })).toBe(true);
    expect(isPositive({ score: null, hit: false })).toBe(false);
  });
});

describe("calibration", () => {
  it("returns only buckets that hold real Calls", () => {
    const buckets = calibration([
      { confidence: 0.72, hit: true },
      { confidence: 0.75, hit: false },
      { confidence: 0.96, hit: true },
    ]);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].from).toBe(0.7);
    expect(buckets[0].total).toBe(2);
    expect(buckets[0].realized).toBe(0.5);
    expect(buckets[1].from).toBe(0.95);
    expect(buckets[1].realized).toBe(1);
  });

  it("plots the mean stated confidence, not the bucket midpoint", () => {
    const [bucket] = calibration([
      { confidence: 0.71, hit: true },
      { confidence: 0.79, hit: true },
    ]);
    expect(bucket.stated).toBeCloseTo(0.75, 10);
  });

  it("is tail dense at the top, where miscalibration lives", () => {
    expect(CALIBRATION_EDGES[0]).toBe(0.55);
    const widths = CALIBRATION_EDGES.map((e, i) =>
      i + 1 < CALIBRATION_EDGES.length ? CALIBRATION_EDGES[i + 1] - e : 1 - e
    );
    expect(widths[widths.length - 1]).toBeLessThan(widths[2]);
  });

  it("ignores a confidence no Call could have carried", () => {
    expect(calibration([{ confidence: 0.2, hit: true }])).toEqual([]);
    expect(calibration([{ confidence: Number.NaN, hit: true }])).toEqual([]);
  });

  it("puts the ceiling confidence in the last bucket rather than dropping it", () => {
    const [bucket] = calibration([{ confidence: 0.99, hit: true }]);
    expect(bucket.from).toBe(0.99);
    expect(bucket.to).toBe(1);
    expect(bucket.total).toBe(1);
  });
});

describe("callProgress", () => {
  it("measures the move against the threshold the Call was sealed with", () => {
    const p = callProgress({
      entry: 100,
      current: 110,
      threshold: 0.4,
      direction: "up",
    });
    expect(p?.move).toBeCloseTo(0.1, 10);
    expect(p?.fraction).toBeCloseTo(0.25, 10);
    expect(p?.clears).toBe(false);
  });

  it("clears once the price passes the target", () => {
    const p = callProgress({
      entry: 100,
      current: 141,
      threshold: 0.4,
      direction: "up",
    });
    expect(p?.fraction).toBe(1);
    expect(p?.clears).toBe(true);
  });

  it("mirrors for a down Call", () => {
    const p = callProgress({
      entry: 100,
      current: 80,
      threshold: 0.4,
      direction: "down",
    });
    expect(p?.toward).toBeCloseTo(0.2, 10);
    expect(p?.fraction).toBeCloseTo(0.5, 10);
    expect(p?.clears).toBe(false);
  });

  it("reads a wrong-way move as no progress at all, never as negative width", () => {
    const p = callProgress({
      entry: 100,
      current: 90,
      threshold: 0.4,
      direction: "up",
    });
    expect(p?.toward).toBeCloseTo(-0.1, 10);
    expect(p?.fraction).toBe(0);
    expect(p?.clears).toBe(false);
  });

  it("treats a zero threshold as the V1 claim, any move in the stated direction", () => {
    expect(
      callProgress({ entry: 100, current: 100.01, threshold: 0, direction: "up" })
        ?.fraction
    ).toBe(1);
    expect(
      callProgress({ entry: 100, current: 99.99, threshold: 0, direction: "up" })
        ?.clears
    ).toBe(false);
  });

  it("refuses to draw anything without two real prices", () => {
    expect(
      callProgress({ entry: 0, current: 10, threshold: 0.1, direction: "up" })
    ).toBeNull();
    expect(
      callProgress({
        entry: 10,
        current: Number.NaN,
        threshold: 0.1,
        direction: "up",
      })
    ).toBeNull();
  });
});

describe("normalizeSources", () => {
  it("keeps absolute https links and drops everything else", () => {
    expect(
      normalizeSources([
        "https://example.com/report",
        "http://example.com/insecure",
        "javascript:alert(1)",
        "/relative/path",
        42,
        "   ",
      ])
    ).toEqual(["https://example.com/report"]);
  });

  it("de-duplicates and caps the list", () => {
    const many = normalizeSources([
      "https://a.example/1",
      "https://a.example/1",
      "https://b.example/2",
      "https://c.example/3",
      "https://d.example/4",
    ]);
    expect(many).toHaveLength(MAX_SOURCES);
    expect(many[0]).toBe("https://a.example/1");
    expect(many[1]).toBe("https://b.example/2");
  });

  it("is empty for anything that is not a list", () => {
    expect(normalizeSources(undefined)).toEqual([]);
    expect(normalizeSources("https://example.com")).toEqual([]);
  });

  it("labels a source by its host", () => {
    expect(sourceLabel("https://www.coingecko.com/en/coins/bitcoin")).toBe(
      "coingecko.com"
    );
    expect(sourceLabel("not a url")).toBe("not a url");
  });
});
