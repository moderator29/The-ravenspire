import { describe, it, expect } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { sumTransfersTo } from "@/lib/chain/verify-transfer";

/* The tribute and trade routes believe exactly one thing a client says: a
   transaction hash. Everything else is read off the chain, and for an ERC-20
   the reading happens here. If it is wrong in the permissive direction, a
   fabricated tribute rings somebody's ravens and a fabricated trade reaches
   every follower of the account that posted it. Every case below is a forgery
   that would otherwise work. */

const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const TOKEN = "0x1111111111111111111111111111111111111111";
const OTHER_TOKEN = "0x2222222222222222222222222222222222222222";
const ME = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STRANGER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

type Log = { address: string; topics: readonly string[]; data: string };

function topics(...args: Parameters<typeof encodeEventTopics>): string[] {
  return encodeEventTopics(...args) as string[];
}

function transfer(args: {
  address?: string;
  from?: string;
  to: string;
  value: bigint;
}): Log {
  return {
    address: args.address ?? TOKEN,
    topics: topics({
      abi: ABI,
      eventName: "Transfer",
      args: {
        from: (args.from ?? STRANGER) as `0x${string}`,
        to: args.to as `0x${string}`,
      },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [args.value]),
  };
}

describe("sumTransfersTo", () => {
  it("counts a transfer of the token into the wallet", () => {
    expect(sumTransfersTo([transfer({ to: ME, value: 500n })], TOKEN, ME)).toBe(500n);
  });

  it("ignores a transfer to somebody else", () => {
    expect(sumTransfersTo([transfer({ to: STRANGER, value: 500n })], TOKEN, ME)).toBe(
      0n
    );
  });

  it("ignores the same event emitted by a different contract", () => {
    /* The cheapest forgery available: deploy a contract, emit a Transfer event
       naming any token and any amount, submit the hash. Only the token's own
       address may speak for the token. */
    expect(
      sumTransfersTo(
        [transfer({ address: OTHER_TOKEN, to: ME, value: 10n ** 24n })],
        TOKEN,
        ME
      )
    ).toBe(0n);
  });

  it("walks past unrelated events from the token itself", () => {
    const approval: Log = {
      address: TOKEN,
      topics: topics({
        abi: ABI,
        eventName: "Approval",
        args: { owner: ME as `0x${string}`, spender: STRANGER as `0x${string}` },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [999n]),
    };
    expect(sumTransfersTo([approval, transfer({ to: ME, value: 7n })], TOKEN, ME)).toBe(
      7n
    );
  });

  it("sums several transfers of the same token in one transaction", () => {
    /* A swap routing through more than one pool pays out in pieces, and the
       whole payout is the amount received. */
    expect(
      sumTransfersTo(
        [transfer({ to: ME, value: 3n }), transfer({ to: ME, value: 4n })],
        TOKEN,
        ME
      )
    ).toBe(7n);
  });

  it("is case insensitive, because nodes return checksummed hex", () => {
    /* The claim row stores lowercase and the node may not. Comparing those raw
       is a real transfer refused, which reads to the member as the realm
       calling them a liar. */
    expect(
      sumTransfersTo(
        [transfer({ address: TOKEN.toUpperCase().replace("0X", "0x"), to: ME, value: 5n })],
        TOKEN.toUpperCase().replace("0X", "0x"),
        ME.toUpperCase().replace("0X", "0x")
      )
    ).toBe(5n);
  });

  it("counts nothing from a transaction that moved no tokens", () => {
    expect(sumTransfersTo([], TOKEN, ME)).toBe(0n);
  });
});
