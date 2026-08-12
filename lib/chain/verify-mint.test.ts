import { describe, it, expect } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  zeroAddress,
} from "viem";
import { countMinted } from "@/lib/chain/verify-mint";

/* The claim confirm route believes exactly one thing the client says: a
   transaction hash. Everything else is read from the chain, and this function
   is where the reading happens. If it is wrong in the permissive direction, a
   member marks a claim settled with somebody else's transaction and the ledger
   disagrees with the chain about who owns what. If it is wrong in the strict
   direction, a real mint is refused and a member is out gas for nothing.

   So every case below is a real attack or a real accident, encoded as the logs
   a node would actually return. */

const ABI = parseAbi([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER_CONTRACT = "0x2222222222222222222222222222222222222222";
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STRANGER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN = "10007";

type Log = { address: string; topics: readonly string[]; data: string };

/* encodeEventTopics types a topic as possibly null, which is true for a
   wildcard filter and never true for the concrete events built below. The cast
   is at the one seam rather than at every call site. */
function topics(...args: Parameters<typeof encodeEventTopics>): string[] {
  return encodeEventTopics(...args) as string[];
}

function transferSingle(args: {
  address?: string;
  from?: string;
  to: string;
  id: string;
  value: bigint;
}): Log {
  return {
    address: args.address ?? CONTRACT,
    topics: topics({
      abi: ABI,
      eventName: "TransferSingle",
      args: {
        operator: WALLET as `0x${string}`,
        from: (args.from ?? zeroAddress) as `0x${string}`,
        to: args.to as `0x${string}`,
      },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [BigInt(args.id), args.value]
    ),
  };
}

function transfer721(args: { to: string; id: string; from?: string }): Log {
  return {
    address: CONTRACT,
    topics: topics({
      abi: ABI,
      eventName: "Transfer",
      args: {
        from: (args.from ?? zeroAddress) as `0x${string}`,
        to: args.to as `0x${string}`,
        tokenId: BigInt(args.id),
      },
    }),
    data: "0x",
  };
}

function transferBatch(args: { to: string; ids: string[]; values: bigint[] }): Log {
  return {
    address: CONTRACT,
    topics: topics({
      abi: ABI,
      eventName: "TransferBatch",
      args: {
        operator: WALLET as `0x${string}`,
        from: zeroAddress,
        to: args.to as `0x${string}`,
      },
    }),
    data: encodeAbiParameters(
      [{ type: "uint256[]" }, { type: "uint256[]" }],
      [args.ids.map((i) => BigInt(i)), args.values]
    ),
  };
}

function count(logs: Log[]): bigint {
  return countMinted({
    logs,
    contract: CONTRACT,
    wallet: WALLET,
    tokenId: TOKEN,
  });
}

describe("countMinted", () => {
  it("counts an ERC-1155 mint to the member's wallet", () => {
    expect(count([transferSingle({ to: WALLET, id: TOKEN, value: 1n })])).toBe(1n);
  });

  it("counts an ERC-721 mint as exactly one", () => {
    expect(count([transfer721({ to: WALLET, id: TOKEN })])).toBe(1n);
  });

  it("picks the right id out of a batch and ignores the rest", () => {
    expect(
      count([
        transferBatch({
          to: WALLET,
          ids: ["10001", TOKEN, "10009"],
          values: [5n, 2n, 7n],
        }),
      ])
    ).toBe(2n);
  });

  it("ignores a mint to somebody else's wallet", () => {
    expect(count([transferSingle({ to: STRANGER, id: TOKEN, value: 1n })])).toBe(0n);
  });

  it("ignores a mint of a different token", () => {
    expect(count([transferSingle({ to: WALLET, id: "10008", value: 1n })])).toBe(0n);
  });

  it("ignores an ordinary transfer, which is somebody else's token arriving", () => {
    /* Not a mint: it moved from a real holder. Buying the card on a
       marketplace must not settle a claim to be given one. */
    expect(
      count([transferSingle({ from: STRANGER, to: WALLET, id: TOKEN, value: 1n })])
    ).toBe(0n);
    expect(count([transfer721({ from: STRANGER, to: WALLET, id: TOKEN })])).toBe(0n);
  });

  it("ignores an identical event emitted by a different contract", () => {
    /* The cheapest forgery available: deploy a contract, emit the same event
       shape, submit the hash. The address filter is the whole defence. */
    expect(
      count([
        transferSingle({
          address: OTHER_CONTRACT,
          to: WALLET,
          id: TOKEN,
          value: 99n,
        }),
      ])
    ).toBe(0n);
  });

  it("walks past unrelated events from our own contract", () => {
    const approval: Log = {
      address: CONTRACT,
      topics: topics({
        abi: ABI,
        eventName: "Approval",
        args: { owner: WALLET as `0x${string}`, spender: STRANGER as `0x${string}` },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [1n]),
    };
    expect(count([approval, transferSingle({ to: WALLET, id: TOKEN, value: 1n })])).toBe(
      1n
    );
  });

  it("sums several mints of the same token in one transaction", () => {
    expect(
      count([
        transferSingle({ to: WALLET, id: TOKEN, value: 1n }),
        transferSingle({ to: WALLET, id: TOKEN, value: 2n }),
      ])
    ).toBe(3n);
  });

  it("is case insensitive about addresses, because nodes return checksummed hex", () => {
    /* A node may report the log's own address in checksummed form while the
       claim row stores it lowercased. Comparing those two raw is a real mint
       refused. The recipient side of the same problem is already covered by
       every other case here: viem decodes `to` as checksummed hex and the
       wallet under test is stored lowercase. */
    const checksummed = "0x1111111111111111111111111111111111111111";
    expect(
      countMinted({
        logs: [transferSingle({ address: checksummed.toUpperCase().replace("0X", "0x"), to: WALLET, id: TOKEN, value: 1n })],
        contract: CONTRACT,
        wallet: WALLET.toUpperCase().replace("0X", "0x"),
        tokenId: TOKEN,
      })
    ).toBe(1n);
  });

  it("counts nothing from an empty receipt", () => {
    expect(count([])).toBe(0n);
  });
});
