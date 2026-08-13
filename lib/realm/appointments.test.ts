import { describe, expect, it } from "vitest";
import {
  CLASH_HOURS,
  CLASH_OPEN_HOUR_UTC,
  MUSTER_BASE_GLORY,
  MUSTER_HOURS_UTC,
  MUSTER_MAX_GLORY,
  MUSTER_PLATEAU_DAY,
  MUSTER_STREAK_GLORY,
  MUSTER_WINDOW_HOURS,
  advanceVigil,
  clashPhase,
  clashWindowOfWeek,
  currentMuster,
  isoWeekMonday,
  musterGlory,
  musterWindowsOn,
  nextClashWindow,
  nextMuster,
  seasonDueToClose,
} from "@/lib/realm/appointments";

const at = (iso: string) => new Date(iso);

/* ============================================================
   The Muster window
   ============================================================ */

describe("musterWindowsOn", () => {
  it("returns one window per configured hour, on the UTC day of the instant", () => {
    const windows = musterWindowsOn(at("2026-08-13T09:30:00.000Z"));
    expect(windows).toHaveLength(MUSTER_HOURS_UTC.length);
    expect(windows.every((w) => w.day === "2026-08-13")).toBe(true);
    expect(windows[0].opensAt.toISOString()).toBe("2026-08-13T01:00:00.000Z");
    expect(windows[1].opensAt.toISOString()).toBe("2026-08-13T13:00:00.000Z");
  });

  it("closes each window exactly MUSTER_WINDOW_HOURS after it opens", () => {
    for (const w of musterWindowsOn(at("2026-08-13T00:00:00.000Z"))) {
      expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(
        MUSTER_WINDOW_HOURS * 3_600_000
      );
    }
  });

  it("takes the UTC day and never the host's day", () => {
    /* 23:30 UTC is already tomorrow in Sydney and still today in London. The
       window set must not depend on which of those machines asked. */
    expect(musterWindowsOn(at("2026-08-13T23:30:00.000Z"))[0].day).toBe(
      "2026-08-13"
    );
    expect(musterWindowsOn(at("2026-08-14T00:00:00.000Z"))[0].day).toBe(
      "2026-08-14"
    );
  });
});

describe("currentMuster boundaries", () => {
  it("is open on the opening instant", () => {
    expect(currentMuster(at("2026-08-13T01:00:00.000Z"))).not.toBeNull();
  });

  it("is open one millisecond before it closes", () => {
    expect(currentMuster(at("2026-08-13T02:59:59.999Z"))).not.toBeNull();
  });

  it("is shut on the closing instant, not a millisecond after", () => {
    /* Half open on purpose. A member arriving on the closing second is late,
       and an inclusive end would let two adjacent windows both claim an
       instant if the hours were ever brought closer together. */
    expect(currentMuster(at("2026-08-13T03:00:00.000Z"))).toBeNull();
  });

  it("is shut one millisecond before it opens", () => {
    expect(currentMuster(at("2026-08-13T00:59:59.999Z"))).toBeNull();
  });

  it("is shut in the long gap between the two windows", () => {
    expect(currentMuster(at("2026-08-13T08:00:00.000Z"))).toBeNull();
  });

  it("names which window is open", () => {
    expect(currentMuster(at("2026-08-13T13:30:00.000Z"))?.index).toBe(1);
    expect(currentMuster(at("2026-08-13T01:30:00.000Z"))?.index).toBe(0);
  });
});

describe("nextMuster", () => {
  it("is today's second window while the first is still running", () => {
    /* A member standing inside a window is not waiting for it. */
    const next = nextMuster(at("2026-08-13T01:30:00.000Z"));
    expect(next.opensAt.toISOString()).toBe("2026-08-13T13:00:00.000Z");
  });

  it("rolls to tomorrow's first window once today's are all past", () => {
    const next = nextMuster(at("2026-08-13T23:00:00.000Z"));
    expect(next.day).toBe("2026-08-14");
    expect(next.opensAt.toISOString()).toBe("2026-08-14T01:00:00.000Z");
  });

  it("rolls across a month end without inventing a day", () => {
    const next = nextMuster(at("2026-08-31T20:00:00.000Z"));
    expect(next.day).toBe("2026-09-01");
  });

  it("rolls across a year end", () => {
    const next = nextMuster(at("2026-12-31T22:00:00.000Z"));
    expect(next.day).toBe("2027-01-01");
  });

  it("is always in the future", () => {
    for (let h = 0; h < 24; h += 1) {
      const now = at(`2026-08-13T${String(h).padStart(2, "0")}:17:00.000Z`);
      expect(nextMuster(now).opensAt.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("the schedule reaches every timezone", () => {
  /* The property the two-window design exists to provide, restated as a test
     as well as a module load assertion. It is checked twice on purpose: the
     assertion stops a bad schedule reaching production, and this stops a bad
     schedule reaching a code review with a green suite. */
  it("opens a window in waking hours at every whole-hour UTC offset", () => {
    const excluded: number[] = [];
    for (let offset = -12; offset <= 14; offset += 1) {
      const ok = MUSTER_HOURS_UTC.some((hour) => {
        const local = (((hour + offset) % 24) + 24) % 24;
        return local >= 7 && local < 23;
      });
      if (!ok) excluded.push(offset);
    }
    expect(excluded).toEqual([]);
  });
});

/* ============================================================
   The vigil
   ============================================================ */

describe("advanceVigil", () => {
  it("starts at one for a member who has never mustered", () => {
    expect(advanceVigil(null, "2026-08-13", 0)).toBe(1);
  });

  it("extends by one on a consecutive day", () => {
    expect(advanceVigil("2026-08-12", "2026-08-13", 4)).toBe(5);
  });

  it("breaks back to one after a missed day", () => {
    expect(advanceVigil("2026-08-11", "2026-08-13", 40)).toBe(1);
  });

  it("does not double count a day already claimed", () => {
    /* The route claims a day, not a window, so catching the second window
       after having caught the first must be the same claim. */
    expect(advanceVigil("2026-08-13", "2026-08-13", 5)).toBe(5);
  });

  it("crosses a month end", () => {
    expect(advanceVigil("2026-08-31", "2026-09-01", 9)).toBe(10);
  });

  it("crosses a year end", () => {
    expect(advanceVigil("2026-12-31", "2027-01-01", 2)).toBe(3);
  });

  it("crosses a leap day", () => {
    expect(advanceVigil("2028-02-28", "2028-02-29", 1)).toBe(2);
    expect(advanceVigil("2028-02-29", "2028-03-01", 2)).toBe(3);
  });

  it("does not break on a non-leap year's 1 March", () => {
    expect(advanceVigil("2026-02-28", "2026-03-01", 6)).toBe(7);
  });

  it("never returns less than one for a claimed day", () => {
    expect(advanceVigil("2026-08-12", "2026-08-13", -3)).toBe(2);
    expect(advanceVigil("2026-08-13", "2026-08-13", 0)).toBe(1);
  });
});

describe("musterGlory", () => {
  it("pays the base on day one", () => {
    expect(musterGlory(1)).toBe(MUSTER_BASE_GLORY);
  });

  it("adds one step per consecutive day", () => {
    expect(musterGlory(2)).toBe(MUSTER_BASE_GLORY + MUSTER_STREAK_GLORY);
    expect(musterGlory(3)).toBe(MUSTER_BASE_GLORY + 2 * MUSTER_STREAK_GLORY);
  });

  it("reaches the ceiling exactly on the plateau day", () => {
    expect(musterGlory(MUSTER_PLATEAU_DAY)).toBe(MUSTER_MAX_GLORY);
    expect(musterGlory(MUSTER_PLATEAU_DAY - 1)).toBe(
      MUSTER_MAX_GLORY - MUSTER_STREAK_GLORY
    );
  });

  it("never pays past the ceiling, however long the vigil", () => {
    expect(musterGlory(365)).toBe(MUSTER_MAX_GLORY);
    expect(musterGlory(10_000)).toBe(MUSTER_MAX_GLORY);
  });

  it("pays nothing for a nonsense streak rather than throwing", () => {
    expect(musterGlory(0)).toBe(0);
    expect(musterGlory(-1)).toBe(0);
    expect(musterGlory(Number.NaN)).toBe(0);
  });

  it("is monotonic, so a longer vigil is never worth less", () => {
    for (let s = 1; s < 40; s += 1) {
      expect(musterGlory(s + 1)).toBeGreaterThanOrEqual(musterGlory(s));
    }
  });
});

/* ============================================================
   The Clash
   ============================================================ */

describe("isoWeekMonday", () => {
  it("returns the Monday of the week containing a midweek day", () => {
    /* 2026-08-13 is a Thursday. */
    expect(isoWeekMonday(at("2026-08-13T09:00:00.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  it("returns the day itself when given a Monday", () => {
    expect(isoWeekMonday(at("2026-08-10T23:59:59.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  it("treats Sunday as the END of its week, not the start", () => {
    /* The one trap in the whole calculation: getUTCDay calls Sunday 0, so an
       unguarded subtraction sends Sunday back to the PREVIOUS Monday plus a
       day. 2026-08-16 is a Sunday and belongs to the week of the 10th. */
    expect(isoWeekMonday(at("2026-08-16T12:00:00.000Z")).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z"
    );
    expect(isoWeekMonday(at("2026-08-17T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z"
    );
  });
});

describe("clashWindowOfWeek", () => {
  it("opens on the Friday of the week at the configured UTC hour", () => {
    const w = clashWindowOfWeek(at("2026-08-13T09:00:00.000Z"));
    expect(w.opensAt.toISOString()).toBe("2026-08-14T18:00:00.000Z");
    expect(w.opensAt.getUTCDay()).toBe(5);
    expect(w.opensAt.getUTCHours()).toBe(CLASH_OPEN_HOUR_UTC);
  });

  it("closes exactly CLASH_HOURS later, on the Sunday", () => {
    const w = clashWindowOfWeek(at("2026-08-13T09:00:00.000Z"));
    expect(w.closesAt.getTime() - w.opensAt.getTime()).toBe(
      CLASH_HOURS * 3_600_000
    );
    expect(w.closesAt.toISOString()).toBe("2026-08-16T18:00:00.000Z");
    expect(w.closesAt.getUTCDay()).toBe(0);
  });

  it("gives every day of one ISO week the same window", () => {
    const monday = clashWindowOfWeek(at("2026-08-10T00:00:00.000Z"));
    for (const day of [11, 12, 13, 14, 15, 16]) {
      const other = clashWindowOfWeek(at(`2026-08-${day}T04:00:00.000Z`));
      expect(other.week).toBe(monday.week);
      expect(other.opensAt.toISOString()).toBe(monday.opensAt.toISOString());
    }
    /* The next Monday is a different Clash. */
    expect(clashWindowOfWeek(at("2026-08-17T04:00:00.000Z")).week).not.toBe(
      monday.week
    );
  });

  it("keys the week off the opening instant, so the key names the window", () => {
    const w = clashWindowOfWeek(at("2026-08-13T09:00:00.000Z"));
    expect(w.week).toBe("2026-W33");
  });

  it("handles a week that spans a year end without renaming it twice", () => {
    /* 2026-12-28 is a Monday and its Thursday is 2026-12-31, so ISO calls the
       whole week 2026-W53 even though its Friday is 2027-01-01. A naive
       calendar-year key would open two Clashes for one week. */
    const w = clashWindowOfWeek(at("2026-12-30T00:00:00.000Z"));
    expect(w.week).toBe("2026-W53");
    expect(w.opensAt.toISOString()).toBe("2027-01-01T18:00:00.000Z");
    expect(clashWindowOfWeek(at("2027-01-02T00:00:00.000Z")).week).toBe(
      "2026-W53"
    );
  });

  it("never lets two consecutive weeks' windows overlap", () => {
    let cursor = at("2026-01-01T00:00:00.000Z");
    let previous = clashWindowOfWeek(cursor);
    for (let i = 0; i < 60; i += 1) {
      cursor = new Date(cursor.getTime() + 7 * 86_400_000);
      const next = clashWindowOfWeek(cursor);
      expect(next.opensAt.getTime()).toBeGreaterThanOrEqual(
        previous.closesAt.getTime()
      );
      expect(next.week).not.toBe(previous.week);
      previous = next;
    }
  });
});

describe("clashPhase", () => {
  const w = clashWindowOfWeek(at("2026-08-13T00:00:00.000Z"));

  it("is upcoming before it opens, including on the closing instant of last week", () => {
    expect(clashPhase(w, at("2026-08-14T17:59:59.999Z"))).toBe("upcoming");
  });

  it("is live from the opening instant", () => {
    expect(clashPhase(w, at("2026-08-14T18:00:00.000Z"))).toBe("live");
    expect(clashPhase(w, at("2026-08-16T17:59:59.999Z"))).toBe("live");
  });

  it("is closed from the closing instant", () => {
    expect(clashPhase(w, at("2026-08-16T18:00:00.000Z"))).toBe("closed");
  });
});

describe("nextClashWindow", () => {
  it("is this week's while it is still upcoming", () => {
    expect(nextClashWindow(at("2026-08-10T00:00:00.000Z")).week).toBe("2026-W33");
  });

  it("is this week's while it is live, because it can still be entered", () => {
    expect(nextClashWindow(at("2026-08-15T12:00:00.000Z")).week).toBe("2026-W33");
  });

  it("rolls to next week's the instant this one closes", () => {
    expect(nextClashWindow(at("2026-08-16T17:59:59.999Z")).week).toBe("2026-W33");
    expect(nextClashWindow(at("2026-08-16T18:00:00.000Z")).week).toBe("2026-W34");
  });

  it("is never a window that has already closed", () => {
    let cursor = at("2026-08-01T00:00:00.000Z");
    for (let i = 0; i < 200; i += 1) {
      cursor = new Date(cursor.getTime() + 7 * 3_600_000);
      expect(nextClashWindow(cursor).closesAt.getTime()).toBeGreaterThan(
        cursor.getTime()
      );
    }
  });
});

/* ============================================================
   The season close
   ============================================================ */

describe("seasonDueToClose", () => {
  const now = at("2026-08-13T12:00:00.000Z");

  it("is due when an active season's end has passed", () => {
    expect(
      seasonDueToClose(
        { id: 1, status: "active", ends_at: "2026-08-13T11:59:00.000Z" },
        now
      )
    ).toBe(true);
  });

  it("is due exactly on the ending instant, never before", () => {
    expect(
      seasonDueToClose(
        { id: 1, status: "active", ends_at: "2026-08-13T12:00:00.000Z" },
        now
      )
    ).toBe(true);
    expect(
      seasonDueToClose(
        { id: 1, status: "active", ends_at: "2026-08-13T12:00:00.001Z" },
        now
      )
    ).toBe(false);
  });

  it("is still due a week late, because a job may miss its run", () => {
    expect(
      seasonDueToClose(
        { id: 1, status: "active", ends_at: "2026-08-06T00:00:00.000Z" },
        now
      )
    ).toBe(true);
  });

  it("is never due twice, because a settled season is not active", () => {
    for (const status of ["settled", "closed", "upcoming", ""]) {
      expect(
        seasonDueToClose(
          { id: 1, status, ends_at: "2026-01-01T00:00:00.000Z" },
          now
        )
      ).toBe(false);
    }
  });

  it("refuses a season with no end date", () => {
    /* The column is NOT NULL, so this guards the SHAPE rather than the data:
       the value arrives through PostgREST as `string | null`. A null must
       never read as "ended long ago", because the cost of guessing wrong in
       that direction is a live season shut on every member in it by a job
       nobody was watching. */
    expect(seasonDueToClose({ id: 1, status: "active", ends_at: null }, now)).toBe(
      false
    );
  });

  it("refuses an unparseable end date rather than guessing", () => {
    expect(
      seasonDueToClose({ id: 1, status: "active", ends_at: "soon" }, now)
    ).toBe(false);
  });
});
