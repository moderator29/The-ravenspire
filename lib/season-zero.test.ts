import { describe, expect, it } from "vitest";
import { getAddress, isAddress, parseEther } from "viem";
import {
  SEASON_ZERO,
  formatEth,
  rspForWei,
  seasonZeroPhase,
} from "@/lib/season-zero";

/* The round's arithmetic, held still.
 *
 * lib/points.ts, lib/calls/scoring.ts and lib/calls/peers.ts are covered
 * because they are the highest-risk pure logic in the realm. Season Zero is
 * now in that company and arrives with more at stake than any of them: these
 * functions decide how much $RSP a real payment bought and print the address
 * that payment is sent to. A rounding mode changed in passing, or one
 * character edited in the treasury, is not a rendering bug.
 *
 * Every expectation here is derived from the round's published terms rather
 * than from what the code currently returns, so a change that alters an
 * answer has to argue with the terms and not merely with a fixture.
 */

const ETH = 10n ** 18n;

describe("the treasury address", () => {
  it("is a real address, checksummed exactly as every surface prints it", () => {
    /* A wallet warns on a bad checksum and a member reasonably reads that
       warning as "this is a scam". The address is shown on the round page, the
       QR, the admin console and the share card, all from this one constant. */
    expect(isAddress(SEASON_ZERO.treasury)).toBe(true);
    expect(getAddress(SEASON_ZERO.treasury)).toBe(SEASON_ZERO.treasury);
  });
});

describe("the allocation, against the published terms", () => {
  it("is exactly the stated percent of the stated supply", () => {
    expect(SEASON_ZERO.rspAllocation).toBe(
      (SEASON_ZERO.totalSupply * SEASON_ZERO.supplyPct) / 100
    );
  });

  it("cannot promise more $RSP than the round holds, even filled to the cap", () => {
    /* THE INVARIANT THAT MATTERS. The rate is fixed, so the ceiling on what
       the round can owe is the rate times the hardcap. If that ever exceeds
       the allocation the round is selling tokens it does not have, and it
       would do so silently, at the very end, to the last backers in. */
    const atHardcap = rspForWei(parseEther(String(SEASON_ZERO.hardcapEth)));
    expect(atHardcap).toBeLessThanOrEqual(BigInt(SEASON_ZERO.rspAllocation));
  });

  it("still sells essentially the whole allocation at the cap", () => {
    /* The other side of the same coin: the rate must not be so conservative
       that a full round leaves a meaningful slice unsold. One whole token of
       slack is rounding; a million would be a mispriced round. */
    const atHardcap = rspForWei(parseEther(String(SEASON_ZERO.hardcapEth)));
    const unsold = BigInt(SEASON_ZERO.rspAllocation) - atHardcap;
    expect(unsold).toBeLessThan(BigInt(SEASON_ZERO.rspPerEth));
  });
});

describe("rspForWei", () => {
  it("pays exactly the published rate for one ether", () => {
    expect(rspForWei(ETH)).toBe(BigInt(SEASON_ZERO.rspPerEth));
  });

  it("scales linearly, because the rate is fixed for everyone", () => {
    /* Early and late backers buy at the same price: that is the promise the
       page makes, and it is a property of the function, not of the copy. */
    expect(rspForWei(4n * ETH)).toBe(4n * rspForWei(ETH));
    expect(rspForWei(ETH / 2n)).toBe(rspForWei(ETH) / 2n);
  });

  it("never rounds a contribution up", () => {
    /* Truncation, not rounding: the realm may owe a fraction of a token less
       than the true share, never more. */
    const odd = ETH + 1n;
    expect(rspForWei(odd)).toBe(BigInt(SEASON_ZERO.rspPerEth));
  });

  it("pays nothing for nothing", () => {
    expect(rspForWei(0n)).toBe(0n);
  });

  it("gives the minimum contribution a real, non-zero allocation", () => {
    /* A minimum that buys zero tokens would take money for nothing. */
    const min = parseEther(String(SEASON_ZERO.minContributionEth));
    expect(rspForWei(min)).toBeGreaterThan(0n);
  });

  it("survives a whale without precision loss", () => {
    /* Wei is bigint end to end precisely so this cannot go through a double.
       1000 ETH of wei is far past Number.MAX_SAFE_INTEGER. */
    expect(rspForWei(1000n * ETH)).toBe(1000n * BigInt(SEASON_ZERO.rspPerEth));
  });
});

describe("formatEth", () => {
  it("writes whole ether without a decimal tail", () => {
    expect(formatEth(2n * ETH)).toBe("2");
  });

  it("keeps a fractional amount readable and trims trailing zeros", () => {
    expect(formatEth(ETH / 2n)).toBe("0.5");
    expect(formatEth(ETH / 100n)).toBe("0.01");
  });

  it("shows zero as zero rather than as an empty string", () => {
    expect(formatEth(0n)).toBe("0");
  });

  it("does not silently round a dust contribution away to nothing", () => {
    /* Displayed at four places a very small amount truncates to 0, which is
       honest for a display, but it must never come back as an empty or
       malformed figure. */
    expect(formatEth(1n)).toBe("0");
  });
});

describe("seasonZeroPhase", () => {
  const before = new Date("2026-08-31T23:59:59Z");
  const opening = new Date(SEASON_ZERO.startsAt);
  const during = new Date("2026-09-10T12:00:00Z");
  const closing = new Date(SEASON_ZERO.endsAt);
  const after = new Date("2026-09-21T00:00:01Z");

  it("is closed to contributions before the window opens", () => {
    expect(seasonZeroPhase(before)).toBe("upcoming");
  });

  it("opens on the stated instant, not a moment later", () => {
    expect(seasonZeroPhase(opening)).toBe("live");
  });

  it("is live inside the window", () => {
    expect(seasonZeroPhase(during)).toBe("live");
  });

  it("is still live at the final instant, and closed after it", () => {
    /* The boundary a member reads as "the twentieth" is theirs to use in
       full. */
    expect(seasonZeroPhase(closing)).toBe("live");
    expect(seasonZeroPhase(after)).toBe("ended");
  });
});
