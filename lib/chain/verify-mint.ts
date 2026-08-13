import "server-only";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  zeroAddress,
} from "viem";
import type { MintConfig } from "@/lib/chain/mint-config";

/* Reading the chain to find out whether a mint actually happened.
 *
 * The client tells us a transaction hash. That is the entire extent of what it
 * is allowed to assert. Everything else, that the transaction exists, that it
 * succeeded, that it came from the member's own wallet, that it hit our
 * contract, that it moved the exact token in the exact amount the voucher
 * named, is read from the chain here. This is the server-authoritative law
 * (AGENTS.md rule 8) applied to the one part of the product where the source
 * of truth is not our database.
 *
 * The failure this exists to prevent is small and cheap to attempt: post the
 * hash of any transaction at all, or of somebody else's real mint, and have
 * the platform mark a claim settled. Every check below closes one version of
 * that.
 */

/* Both shapes a mint can arrive in. ERC-1155 for the print runs and ERC-721
   for the one-of-ones, decided per card (docs/RAVENSPIRE-V2.md section 28.3),
   so the verifier understands both rather than assuming the standard the first
   contract happened to use. */
const MINT_EVENTS = parseAbi([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

/* Blocks that must sit on top of the mint before it is called settled. Base
   reorgs are rare and shallow, and a claim marked minted is a claim that
   cannot be re-issued, so a short wait is cheaper than an unwind. The UI polls
   through the `pending` verdict rather than showing a failure. */
const REQUIRED_CONFIRMATIONS = 2n;

export type MintVerdict =
  /* Real, settled, and exactly what the voucher promised. */
  | { ok: true; blockNumber: string }
  /* Not settled yet, and worth asking again shortly. Never a lie: the
     transaction may be in the mempool, in an unconfirmed block, or the node
     may simply not have it yet. */
  | { ok: false; pending: true; reason: string }
  /* Settled as wrong. Asking again will not change the answer. */
  | { ok: false; pending: false; reason: string };

export async function verifyMint(args: {
  config: MintConfig;
  txHash: `0x${string}`;
  /* The wallet the voucher was issued to, lowercased. */
  wallet: string;
  /* The contract the voucher was issued against, lowercased. */
  contract: string;
  tokenId: string;
  amount: number;
}): Promise<MintVerdict> {
  const { config, txHash, wallet, contract, tokenId, amount } = args;

  const client = createPublicClient({ transport: http(config.chain.rpcUrl) });

  /* The RPC is pointed at a chain by configuration, and a configuration
     mistake here means reading receipts off the wrong network entirely, where
     a hash either does not exist or, worse, belongs to something else. Ask the
     node what it is before believing anything it says. */
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch {
    return { ok: false, pending: true, reason: "The chain could not be reached" };
  }
  if (chainId !== config.chain.id) {
    return {
      ok: false,
      pending: false,
      reason: "The realm is reading the wrong chain",
    };
  }

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch {
    /* viem throws when the receipt is not found, which is the ordinary state
       of a transaction that was broadcast a second ago. */
    return {
      ok: false,
      pending: true,
      reason: "The transaction has not been mined yet",
    };
  }

  if (receipt.status !== "success") {
    return { ok: false, pending: false, reason: "The transaction failed" };
  }

  /* Sent by the member's own wallet. A voucher names one address and only that
     address can spend it at the contract, but checking here means a claim can
     never be settled by somebody else's transaction even if the contract is
     later replaced by a laxer one. */
  if (receipt.from.toLowerCase() !== wallet.toLowerCase()) {
    return {
      ok: false,
      pending: false,
      reason: "That transaction was not sent by your wallet",
    };
  }

  /* Sent to our contract. `to` is null for a contract creation, which is not
     a mint by any reading. */
  if (!receipt.to || receipt.to.toLowerCase() !== contract.toLowerCase()) {
    return {
      ok: false,
      pending: false,
      reason: "That transaction did not reach the realm's contract",
    };
  }

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return { ok: false, pending: true, reason: "The chain could not be reached" };
  }
  if (head < receipt.blockNumber + REQUIRED_CONFIRMATIONS - 1n) {
    return {
      ok: false,
      pending: true,
      reason: "Waiting for the chain to settle",
    };
  }

  /* The receipt says a transaction to our contract succeeded. It does not say
     what it did. Only the logs do, so the token and the amount are counted out
     of the events, from our contract's address only: a log emitted by some
     other contract in the same transaction proves nothing about ours. */
  const minted = countMinted({
    logs: receipt.logs,
    contract: contract.toLowerCase(),
    wallet: wallet.toLowerCase(),
    tokenId,
  });

  if (minted <= 0n) {
    return {
      ok: false,
      pending: false,
      reason: "That transaction did not mint this collectible to you",
    };
  }
  if (minted < BigInt(amount)) {
    return {
      ok: false,
      pending: false,
      reason: "That transaction minted fewer than the claim promised",
    };
  }

  return { ok: true, blockNumber: String(receipt.blockNumber) };
}

/* How many of `tokenId` this transaction minted to `wallet`, counted from our
   contract's own logs. Exported for its unit test: the decoding is the part
   most likely to be quietly wrong, and it is the part that decides whether a
   claim settles. */
export function countMinted(args: {
  logs: readonly { address: string; topics: readonly string[]; data: string }[];
  contract: string;
  wallet: string;
  tokenId: string;
}): bigint {
  /* Both sides lowercased here rather than trusting the caller. Nodes return
     checksummed hex, the database stores lowercase, and an address comparison
     that is right in nine call sites and raw in the tenth is a real mint
     refused for a reason nobody can see. */
  const contract = args.contract.toLowerCase();
  const wallet = args.wallet.toLowerCase();
  const { logs, tokenId } = args;
  const want = BigInt(tokenId);
  let total = 0n;

  for (const log of logs) {
    if (log.address.toLowerCase() !== contract) continue;

    let event;
    try {
      event = decodeEventLog({
        abi: MINT_EVENTS,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
      });
    } catch {
      /* Any other event from the same contract. Not our business. */
      continue;
    }

    if (event.eventName === "TransferSingle") {
      const { from, to, id, value } = event.args;
      /* A mint moves from the zero address. A transfer from a real holder into
         the member's wallet is somebody else's token arriving, which is not
         the claim being settled. */
      if (from !== zeroAddress) continue;
      if (to.toLowerCase() !== wallet) continue;
      if (id !== want) continue;
      total += value;
      continue;
    }

    if (event.eventName === "TransferBatch") {
      const { from, to, ids, values } = event.args;
      if (from !== zeroAddress) continue;
      if (to.toLowerCase() !== wallet) continue;
      for (let i = 0; i < ids.length; i += 1) {
        if (ids[i] === want) total += values[i] ?? 0n;
      }
      continue;
    }

    if (event.eventName === "Transfer") {
      const { from, to, tokenId: id } = event.args;
      if (from !== zeroAddress) continue;
      if (to.toLowerCase() !== wallet) continue;
      if (id !== want) continue;
      /* An ERC-721 mint is exactly one token by definition. */
      total += 1n;
    }
  }

  return total;
}
