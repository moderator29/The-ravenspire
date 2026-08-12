import { describe, expect, it } from "vitest";
import { realmDay, realmWeek } from "@/lib/realm/period";

const utc = (s: string) => new Date(`${s}T12:00:00.000Z`);

describe("realmDay", () => {
  it("is the UTC day, not the host's", () => {
    expect(realmDay(new Date("2026-08-12T23:59:59.000Z"))).toBe("2026-08-12");
    expect(realmDay(new Date("2026-08-13T00:00:01.000Z"))).toBe("2026-08-13");
  });
});

describe("realmWeek follows ISO 8601", () => {
  it("runs Monday to Sunday", () => {
    /* 2026-08-10 is a Monday, 2026-08-16 the Sunday that closes its week. */
    expect(realmWeek(utc("2026-08-10"))).toBe(realmWeek(utc("2026-08-16")));
    /* The next Monday is a different week. */
    expect(realmWeek(utc("2026-08-17"))).not.toBe(realmWeek(utc("2026-08-16")));
  });

  it("puts early January in the previous ISO year when it belongs there", () => {
    /* 2027-01-01 is a Friday, so it sits in the week of Monday 2026-12-28,
       which is ISO week 53 of 2026. A naive "week of the calendar year" would
       call it 2027-W01 and the realm would write two cards for one week. */
    expect(realmWeek(utc("2027-01-01"))).toBe("2026-W53");
    expect(realmWeek(utc("2026-12-28"))).toBe("2026-W53");
  });

  it("puts late December in the next ISO year when it belongs there", () => {
    /* 2024-12-30 is a Monday and its Thursday falls in 2025, so ISO calls it
       2025-W01. */
    expect(realmWeek(utc("2024-12-30"))).toBe("2025-W01");
  });

  it("agrees with the known ISO week of a reference date", () => {
    /* 2026-01-01 is a Thursday, so it is week 1 of 2026 by definition. */
    expect(realmWeek(utc("2026-01-01"))).toBe("2026-W01");
    /* 2021-01-04, the first Monday of ISO 2021. */
    expect(realmWeek(utc("2021-01-04"))).toBe("2021-W01");
    /* 2021-01-03 is the Sunday closing ISO 2020's week 53. */
    expect(realmWeek(utc("2021-01-03"))).toBe("2020-W53");
  });

  it("pads the week number so keys sort", () => {
    expect(realmWeek(utc("2026-03-02"))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("is stable across the hours of one UTC day", () => {
    const a = realmWeek(new Date("2026-08-12T00:00:00.000Z"));
    const b = realmWeek(new Date("2026-08-12T23:59:59.000Z"));
    expect(a).toBe(b);
  });
});
