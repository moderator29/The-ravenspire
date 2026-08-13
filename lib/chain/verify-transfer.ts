import "server-only";
import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";
import { rpcUrl } from "@/lib/chain/rpc";

/* Reading the chain to find out whether a tribute or a trade actually
 * happened.
 *
 * THE HOLE THIS CLOSES. Both /api/tips and /api/trade/record took a
 * transaction hash from the client and wrote a row. Nothing checked the hash
 * against anything. So any signed-in member could post a hash they found on a
 * block explorer, or one they invented, and the realm would publish it: a
 * tribute the recipient never received, ringing their ravens, or a trade in the
 * shared feed fanning a notification out to every follower. That is fabricated
 * social proof, produced with a curl command, and a rate limit only slows it
 * down. This is the check that makes the claim mean something.
 *
 * WHAT IS PROVEN, and it is deliberately narrow. That the transaction exists on
 * the chain the caller named, that it succeeded, that it was sent by that
 * member's own wallet, and, for a tribute, that value of at least the claimed
 * amount reached the named recipient. Anything beyond that (which router a swap
 * went through, what a token was worth at the time) is not proven here and is
 * not claimed to be.
 *
 * THREE ANSWERS, NEVER TWO. Verified, not yet (the transaction is real but the
 * chain has not settled it, or the realm cannot reach that chain), and refused.
 * Collapsing the middle one into either of the others is what makes this kind
 * of check unusable: a member who posts a hash two seconds after broadcasting
 * it has done nothing wrong, and an environment with no RPC key has not caught
 * anybody lying.
 */

const TRANSFER_EVENTS = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

/* Blocks that must sit on top before a transfer counts as settled. One
   confirmation past inclusion, which is enough on every chain here for a
   transfer that is not being reorged out, and short enough that the client's
   own polling covers it. */
const REQUIRED_CONFIRMATIONS = 2n;

export type TransferVerdict =
  | { verified: true }
  /* Real so far, but not settled, or not checkable from here. Worth asking
     again. Never treated as proof and never treated as a lie. */
  | { verified: false; pending: true; reason: string }
  /* Checked and wrong. Asking again will not change the answer. */
  | { verified: false; pending: false; reason: string };

/* Not configured for this chain: the honest answer is that the realm does not
   know, which is the pending shape. Exported so a route can distinguish "we did
   not check" from "we checked and it is settling" when it wants to. */
export function chainUncheckable(chainId: number): boolean {
  return rpcUrl(chainId) === null;
}

async function settledReceipt(args: {
  chainId: number;
  txHash: `0x${string}`;
  from: string;
}): Promise<
  | { ok: true; receipt: Awaited<ReturnType<ReturnType<typeof createPublicClient>["getTransactionReceipt"]>>; value: bigint; to: string | null }
  | { ok: false; verdict: TransferVerdict }
> {
  const url = rpcUrl(args.chainId);
  if (!url) {
    return {
      ok: false,
      verdict: {
        verified: false,
        pending: true,
        reason: "The realm cannot read that chain",
      },
    };
  }

  const client = createPublicClient({ transport: http(url) });

  let receipt;
  let tx;
  try {
    [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: args.txHash }),
      client.getTransaction({ hash: args.txHash }),
    ]);
  } catch {
    /* viem throws when a hash is not known to the node, which is the ordinary
       state of a transaction broadcast a moment ago and also the state of one
       that never existed. Those two are indistinguishable from here, and
       calling an invented hash "pending" costs nothing: a pending record is
       kept out of the feed until it settles, and one that never settles never
       enters it. */
    return {
      ok: false,
      verdict: {
        verified: false,
        pending: true,
        reason: "The transaction has not been mined yet",
      },
    };
  }

  if (receipt.status !== "success") {
    return {
      ok: false,
      verdict: { verified: false, pending: false, reason: "That transaction failed" },
    };
  }

  /* Sent by the member's own wallet. Without this, the most obvious forgery is
     posting somebody else's real transaction as your own. */
  if (receipt.from.toLowerCase() !== args.from.toLowerCase()) {
    return {
      ok: false,
      verdict: {
        verified: false,
        pending: false,
        reason: "That transaction was not sent by your wallet",
      },
    };
  }

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return {
      ok: false,
      verdict: {
        verified: false,
        pending: true,
        reason: "The chain could not be reached",
      },
    };
  }
  if (head < receipt.blockNumber + REQUIRED_CONFIRMATIONS - 1n) {
    return {
      ok: false,
      verdict: { verified: false, pending: true, reason: "Waiting for the chain to settle" },
    };
  }

  return {
    ok: true,
    receipt,
    value: tx.value,
    to: receipt.to ?? null,
  };
}

/* A tribute: a transfer of value from the tipper's own wallet to the
   recipient's. Native by default, because that is what the tip dialog sends;
   an ERC-20 tribute names its token contract and is checked in the logs. */
export async function verifyTribute(args: {
  chainId: number;
  txHash: `0x${string}`;
  from: string;
  to: string;
  /* The claimed amount in the token's smallest unit. The transfer must carry
     at least this much: more is a member being generous between broadcasting
     and recording, less is a claim the chain does not support. */
  minAmount: bigint;
  /* Absent for a native transfer. */
  tokenContract?: string | null;
}): Promise<TransferVerdict> {
  const settled = await settledReceipt(args);
  if (!settled.ok) return settled.verdict;

  const to = args.to.toLowerCase();

  if (!args.tokenContract) {
    /* A native transfer pays the recipient directly, so the transaction's own
       `to` and `value` are the whole story. */
    if (!settled.to || settled.to.toLowerCase() !== to) {
      return {
        verified: false,
        pending: false,
        reason: "That transfer did not reach the recipient",
      };
    }
    if (settled.value < args.minAmount) {
      return {
        verified: false,
        pending: false,
        reason: "That transfer carried less than the tribute claimed",
      };
    }
    return { verified: true };
  }

  const token = args.tokenContract.toLowerCase();
  const moved = sumTransfersTo(settled.receipt.logs, token, to);
  if (moved < args.minAmount) {
    return {
      verified: false,
      pending: false,
      reason: "That transaction did not move the tribute to the recipient",
    };
  }
  return { verified: true };
}

/* A market payment leg: the buyer's own wallet moved at least this much of the
 * pay token to this payee, in this transaction.
 *
 * ONE TRANSACTION MAY PROVE BOTH LEGS. A sale has two payees, the seller and
 * the Coffers, and a plain ERC-20 transfer pays one address, so a buyer
 * ordinarily signs twice. A wallet that can batch calls pays both in a single
 * transaction, and then the same hash proves both legs and this is called twice
 * against the same receipt. That is why the payee is an argument rather than
 * baked in, and why nothing here assumes a transaction carries exactly one
 * transfer.
 *
 * WHY THE LOGS AND NOT THE TRANSACTION'S OWN `to`. An ERC-20 transfer's
 * transaction is addressed to the token contract, never to the payee, so the
 * only place the payment is visible is the token's own Transfer event.
 * sumTransfersTo already refuses any log that was not emitted by the token
 * contract itself, which is what stops a buyer pointing at a transaction where
 * some other contract emitted an event of the same shape. That forgery costs a
 * few cents of gas and would otherwise buy a card.
 *
 * AT LEAST, NOT EXACTLY. A buyer who sends a little more has overpaid, which
 * is their business and not a reason to refuse them the card. A buyer who
 * sends less has not paid the price, and the chain says so. */
export async function verifyMarketLeg(args: {
  chainId: number;
  txHash: `0x${string}`;
  /* The buyer's own wallet, read from their profile. Never from the request. */
  from: string;
  /* The seller's own wallet, or the Coffers. Never from the request. */
  to: string;
  /* The pay token's contract. Only this contract may speak for the payment. */
  token: string;
  /* The leg's amount in the token's base units, derived by exact integer
     arithmetic from the listing's own minor-unit amounts. */
  minAmount: bigint;
}): Promise<TransferVerdict> {
  const settled = await settledReceipt(args);
  if (!settled.ok) return settled.verdict;

  const moved = sumTransfersTo(
    settled.receipt.logs,
    args.token.toLowerCase(),
    args.to.toLowerCase()
  );
  if (moved < args.minAmount) {
    return {
      verified: false,
      pending: false,
      reason: "That transaction did not carry the full amount to that address",
    };
  }
  return { verified: true };
}

/* A trade: the member's own wallet sent a transaction that succeeded on the
   chain they named. That is what a trade record claims and it is what is
   checked.
 *
 * What is NOT checked, on purpose: the amounts. A swap routes through an
 * aggregator, splits across pools and can settle in a wrapped token, so an
 * amount check would refuse honest trades far more often than it caught
 * dishonest ones. Where the trade names a token it received, the logs are
 * checked for a transfer of it into the member's wallet, which is cheap and
 * catches the obvious forgery of pasting an unrelated transaction. */
export async function verifyTrade(args: {
  chainId: number;
  txHash: `0x${string}`;
  from: string;
  /* The token the member says they received, when they named one. */
  receivedToken?: string | null;
}): Promise<TransferVerdict> {
  const settled = await settledReceipt(args);
  if (!settled.ok) return settled.verdict;

  if (args.receivedToken) {
    const moved = sumTransfersTo(
      settled.receipt.logs,
      args.receivedToken.toLowerCase(),
      args.from.toLowerCase()
    );
    if (moved <= 0n) {
      return {
        verified: false,
        pending: false,
        reason: "That transaction did not move the coin into your wallet",
      };
    }
  }

  return { verified: true };
}

/* How much of `token` this transaction moved to `to`, from the token's own
   logs. Exported for its unit test: the decoding is the part most likely to be
   quietly wrong, and it is the part the verdict turns on. */
export function sumTransfersTo(
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
  token: string,
  to: string
): bigint {
  const wantToken = token.toLowerCase();
  const wantTo = to.toLowerCase();
  let total = 0n;

  for (const log of logs) {
    /* Only the token's own contract may speak for the token. Any other
       contract emitting the same event shape proves nothing, and emitting one
       is the cheapest forgery available. */
    if (log.address.toLowerCase() !== wantToken) continue;
    try {
      const event = decodeEventLog({
        abi: TRANSFER_EVENTS,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
      });
      if (event.eventName !== "Transfer") continue;
      if (event.args.to.toLowerCase() !== wantTo) continue;
      total += event.args.value;
    } catch {
      /* Some other event from the same contract, or an ERC-721 Transfer, whose
         third argument is indexed and so does not decode against this ABI.
         Neither is a fungible transfer. */
      continue;
    }
  }

  return total;
}
