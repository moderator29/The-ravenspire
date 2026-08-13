import { describe, it, expect } from "vitest";
import {
  MOVEMENT_CATEGORIES,
  STREAM_LABEL,
  foldStatement,
  reconcile,
  reconciliationLine,
  streamFor,
  type LedgerRow,
} from "@/lib/economy/earnings";

/* The Coffers is the one surface in the realm whose whole job is to be right
   about somebody's balance. Every test here is a way the surface it replaces
   was wrong, or a way this one could be.

   The four defects that motivated the rewrite are each pinned by a named case
   below: a stake escrow counted as a loss of earnings, a returned stake
   counted as an earning, a breakdown that could not add up to its own total,
   and a total presented as reconciled when the read behind it was truncated. */

let seq = 0;
function row(over: Partial<LedgerRow> = {}): LedgerRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    points_delta: 0,
    glory_delta: 0,
    reason: "sent_a_raven",
    category: "social",
    created_at: `2026-08-${String((seq % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    ...over,
  };
}

describe("streamFor", () => {
  it("reads the exact reasons the realm actually writes", () => {
    expect(streamFor("sent_a_raven")).toBe("ravens");
    expect(streamFor("replied")).toBe("ravens");
    expect(streamFor("sealed_a_call")).toBe("calls");
    expect(streamFor("call_resolved")).toBe("calls");
    expect(streamFor("war_victory")).toBe("war");
    expect(streamFor("duel_won")).toBe("war");
    expect(streamFor("muster")).toBe("muster");
    expect(streamFor("took_the_black")).toBe("arrival");
  });

  it("reads the two reason families that carry an id inside them", () => {
    expect(streamFor("liked_by_2f1c9d3e-0000-4000-8000-000000000001")).toBe("ravens");
    expect(streamFor("quest_send-three-ravens")).toBe("quests");
  });

  /* THE REFERRAL BUG. The old surface looked for a reason beginning
     "referral", which nothing has ever written: a referral pays through
     `banner_raised`. So every referral reward in the realm reported as zero and
     fell into Other. */
  it("finds referral rewards under the reason the realm actually writes", () => {
    expect(streamFor("banner_raised")).toBe("banners");
    expect(streamFor("banner_answered")).toBe("banners");
    expect(streamFor("referral")).toBe("other");
    expect(streamFor("referral_bonus")).toBe("other");
  });

  it("puts an unknown reason in Other rather than dropping it", () => {
    expect(streamFor("something_a_later_release_invents")).toBe("other");
  });

  it("labels every stream it can produce", () => {
    for (const reason of ["sent_a_raven", "muster", "nonsense"]) {
      expect(STREAM_LABEL[streamFor(reason)]).toBeTruthy();
    }
  });
});

describe("foldStatement, the earnings figure", () => {
  it("counts only positive awards as earned", () => {
    const s = foldStatement([
      row({ points_delta: 8, reason: "sent_a_raven" }),
      row({ points_delta: 40, reason: "call_resolved", category: "call" }),
      row({ points_delta: 60, reason: "banner_raised", category: null }),
    ]);
    expect(s.earned).toBe(108);
    expect(s.spent).toBe(0);
    expect(s.net).toBe(108);
  });

  /* THE STAKE BUG, BOTH HALVES. The old surface added the negative row a staked
     Call writes at escrow into a figure labelled "points earned", so sealing a
     staked Call made a member's lifetime earnings fall; and it added the
     positive row a won stake writes, so getting your own points back read as
     earning them. Neither is an earning and neither may touch that figure. */
  it("keeps a stake escrow out of the earnings figure entirely", () => {
    const s = foldStatement([
      row({ points_delta: 8, reason: "sent_a_raven" }),
      row({ points_delta: -500, reason: "call_stake_escrowed", category: "stake" }),
    ]);
    expect(s.earned).toBe(8);
    expect(s.spent).toBe(0);
    expect(s.stakes.staked).toBe(500);
    /* The balance still moved, and the reconciliation target still says so. */
    expect(s.net).toBe(-492);
  });

  it("keeps a returned stake out of the earnings figure too", () => {
    const s = foldStatement([
      row({ points_delta: -500, reason: "call_stake_escrowed", category: "stake" }),
      row({ points_delta: 700, reason: "call_stake_won", category: "stake" }),
    ]);
    expect(s.earned).toBe(0);
    expect(s.stakes.staked).toBe(500);
    expect(s.stakes.returned).toBe(700);
    expect(s.stakes.net).toBe(200);
    expect(s.net).toBe(200);
  });

  it("names a Warden's Pardon separately from a settlement", () => {
    const s = foldStatement([
      row({ points_delta: -400, reason: "call_stake_escrowed", category: "stake" }),
      row({ points_delta: 200, reason: "wardens_pardon", category: "stake" }),
    ]);
    expect(s.stakes.returned).toBe(0);
    expect(s.stakes.pardoned).toBe(200);
    expect(s.stakes.net).toBe(-200);
  });

  it("reports an endowment as given, never as spent and never as earned", () => {
    const s = foldStatement([
      row({ points_delta: 8, reason: "sent_a_raven" }),
      row({ points_delta: -600, reason: "house_endowed", category: "house" }),
    ]);
    expect(s.given).toBe(600);
    expect(s.earned).toBe(8);
    expect(s.spent).toBe(0);
    expect(s.net).toBe(-592);
  });

  it("treats both movement categories as movements", () => {
    for (const category of MOVEMENT_CATEGORIES) {
      const s = foldStatement([row({ points_delta: -100, category, reason: "x" })]);
      expect(s.earned).toBe(0);
      expect(s.spent).toBe(0);
      expect(s.streams).toHaveLength(0);
    }
  });
});

describe("foldStatement, the breakdown", () => {
  /* THE BREAKDOWN BUG. The old surface filtered its slices to positives and did
     not filter its total, so the percentages beside the slices could not add to
     a hundred and nothing said why. Here the streams are the earnings figure,
     exactly, by construction. */
  it("splits the earned figure across streams and loses nothing", () => {
    const s = foldStatement([
      row({ points_delta: 8, reason: "sent_a_raven" }),
      row({ points_delta: 4, reason: "replied" }),
      row({ points_delta: 40, reason: "call_resolved", category: "call" }),
      row({ points_delta: 25, reason: "war_victory", category: "war" }),
      row({ points_delta: 60, reason: "banner_raised", category: null }),
      row({ points_delta: -500, reason: "call_stake_escrowed", category: "stake" }),
    ]);
    const fromStreams = s.streams.reduce((n, x) => n + x.points, 0);
    expect(fromStreams).toBe(s.earned - s.spent);
    expect(fromStreams).toBe(137);
  });

  it("ranks the streams largest first", () => {
    const s = foldStatement([
      row({ points_delta: 5, reason: "sent_a_raven" }),
      row({ points_delta: 90, reason: "war_victory", category: "war" }),
      row({ points_delta: 40, reason: "call_resolved", category: "call" }),
    ]);
    expect(s.streams.map((x) => x.slug)).toEqual(["war", "calls", "ravens"]);
  });

  it("keeps a stream that nets to zero rather than hiding it", () => {
    const s = foldStatement([
      row({ points_delta: 10, reason: "sent_a_raven" }),
      row({ points_delta: -10, reason: "sent_a_raven" }),
    ]);
    expect(s.streams).toHaveLength(1);
    expect(s.streams[0].points).toBe(0);
    expect(s.streams[0].events).toBe(2);
  });
});

describe("foldStatement, the hostile cases", () => {
  /* A REPLAYED ROW. The ledger is read in pages ordered by created_at, which is
     not unique, so two awards written in the same microsecond straddle a page
     boundary and the second page repeats one. Counted twice, the statement
     drifts from the balance by exactly that row and the surface accuses the
     realm of losing a member's points. */
  it("counts a duplicated row once and says it saw one", () => {
    const dup = row({ points_delta: 40, reason: "call_resolved", category: "call" });
    const s = foldStatement([dup, dup, row({ points_delta: 8 })]);
    expect(s.earned).toBe(48);
    expect(s.net).toBe(48);
    expect(s.duplicates).toBe(1);
  });

  it("refuses a fractional delta rather than rounding somebody's balance", () => {
    expect(() => foldStatement([row({ points_delta: 0.5 })])).toThrow(/whole POINTS/);
    expect(() => foldStatement([row({ glory_delta: 1.25 })])).toThrow(/whole POINTS/);
  });

  it("carries a negative award into spent and into the balance", () => {
    /* Nothing writes one today. The day something does, it must appear as a
       reduction rather than be dropped, or the statement stops reconciling. */
    const s = foldStatement([
      row({ points_delta: 100, reason: "sent_a_raven" }),
      row({ points_delta: -30, reason: "sent_a_raven" }),
    ]);
    expect(s.earned).toBe(100);
    expect(s.spent).toBe(30);
    expect(s.net).toBe(70);
  });

  it("folds an empty ledger without inventing anything", () => {
    const s = foldStatement([]);
    expect(s).toMatchObject({ earned: 0, spent: 0, given: 0, net: 0, events: 0 });
    expect(s.streams).toEqual([]);
    expect(s.firstAt).toBeNull();
    expect(s.lastAt).toBeNull();
  });

  it("takes the first and last event from the rows, in any order", () => {
    const s = foldStatement([
      row({ points_delta: 1, created_at: "2026-08-20T00:00:00.000Z" }),
      row({ points_delta: 1, created_at: "2026-08-01T00:00:00.000Z" }),
      row({ points_delta: 1, created_at: "2026-08-10T00:00:00.000Z" }),
    ]);
    expect(s.firstAt).toBe("2026-08-01T00:00:00.000Z");
    expect(s.lastAt).toBe("2026-08-20T00:00:00.000Z");
  });

  it("does not count a row that moved nothing as an event", () => {
    const s = foldStatement([row({ points_delta: 0, glory_delta: 0 })]);
    expect(s.events).toBe(0);
    expect(s.firstAt).toBeNull();
  });
});

describe("reconcile", () => {
  it("agrees when the ledger explains the balance", () => {
    const r = reconcile({ cached: 1200, ledgerNet: 1200, partial: false });
    expect(r).toMatchObject({ drift: 0, reconciled: true, partial: false });
    expect(reconciliationLine(r)).toMatch(/accounted for/);
  });

  it("reports a balance holding more than the entries explain", () => {
    const r = reconcile({ cached: 1250, ledgerNet: 1200, partial: false });
    expect(r.drift).toBe(50);
    expect(r.reconciled).toBe(false);
    expect(reconciliationLine(r)).toMatch(/50 POINTS more than the entries/);
  });

  it("reports entries adding to more than the balance holds", () => {
    const r = reconcile({ cached: 1150, ledgerNet: 1200, partial: false });
    expect(r.drift).toBe(-50);
    expect(reconciliationLine(r)).toMatch(/50 POINTS more than your balance/);
  });

  /* THE TRUNCATION BUG. A statement folded from the first page of a long ledger
     will always disagree with the balance. Calling that a discrepancy would
     accuse the realm of losing points at every heavy member in the realm. */
  it("never calls a truncated read reconciled, even when it happens to agree", () => {
    const r = reconcile({ cached: 1200, ledgerNet: 1200, partial: true });
    expect(r.reconciled).toBe(false);
    expect(reconciliationLine(r)).toMatch(/not checked against your balance/);
  });
});
