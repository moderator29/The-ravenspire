import "server-only";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { MintConfig } from "@/lib/chain/mint-config";
import { contractFor } from "@/lib/chain/mint-config";
import { isSoulbound, type ClaimSubjectKind } from "@/lib/collectibles/token-ids";

/* The claim voucher: a signed promise that a named wallet may mint a named
 * token, once, before a deadline.
 *
 * This is the piece that makes rule 6 survive contact with NFTs. The platform
 * does not mint anything and does not hold anything. It signs a statement, the
 * member's own wallet carries that statement to the contract, and the member
 * pays their own gas. If the platform vanished tomorrow, an unspent voucher
 * would still work, which is the honest test of whether a thing is custodial.
 *
 * EIP-712 rather than a bare hash so that what the member's wallet shows them
 * before they sign is readable: the token, the amount, the deadline and the
 * address it lands at, in named fields. A wallet prompt that reads as a wall
 * of hex is how people get robbed.
 *
 * THE REPLAY GUARDS, all three, because on-chain mistakes are permanent:
 *   1. `nonce` is 32 random bytes, unique in the claim ledger, and inside the
 *      signed payload. The contract marks it spent.
 *   2. `deadline` bounds how long a leaked voucher is worth anything.
 *   3. `to` is the member's own wallet, so a stolen voucher mints into the
 *      wallet it was always going to mint into.
 * The database adds a fourth: one open claim per member per item, so asking
 * twice hands back the same voucher rather than a second right to one thing.
 */

export const VOUCHER_TTL_SECONDS = 6 * 60 * 60;

/* The EIP-712 type. Kept in one place because the contract's struct and this
   object must be identical, field for field, in order: a mismatch produces a
   signature that verifies against nothing and fails at the worst possible
   moment, in the member's wallet, after they have paid gas. */
export const CLAIM_TYPES = {
  Claim: [
    { name: "to", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
    { name: "soulbound", type: "bool" },
  ],
} as const;

export const CLAIM_DOMAIN_NAME = "Ravenspire Claim";
export const CLAIM_DOMAIN_VERSION = "1";

export interface ClaimVoucher {
  to: `0x${string}`;
  /* uint256 fields travel as decimal strings. JSON has no integer wide enough
     and a number would silently round somewhere above 2^53. */
  tokenId: string;
  amount: string;
  nonce: `0x${string}`;
  deadline: string;
  soulbound: boolean;
}

export interface SignedClaimVoucher {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof CLAIM_TYPES;
  primaryType: "Claim";
  message: ClaimVoucher;
  signature: `0x${string}`;
}

/* 32 random bytes from the platform's own entropy. Not derived from the member
   id or the token, both of which are guessable, and not a counter, which
   invites two routes to reach the same number. */
export function claimNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

export async function signClaimVoucher(args: {
  config: MintConfig;
  kind: ClaimSubjectKind;
  to: `0x${string}`;
  tokenId: string;
  amount: number;
  nonce: `0x${string}`;
  /* Unix seconds. Passed in rather than read from the clock here so the row
     written to the claim ledger and the payload that was signed carry the
     same instant, with no chance of a millisecond between them. */
  deadline: number;
}): Promise<SignedClaimVoucher> {
  const { config, kind, to, tokenId, amount, nonce, deadline } = args;

  const verifyingContract = contractFor(config, kind);
  const message: ClaimVoucher = {
    to,
    tokenId,
    amount: String(amount),
    nonce,
    deadline: String(deadline),
    /* Carried in the signed payload even though the contract address already
       decides it. The voucher then describes its own intent, so a soulbound
       claim can never be replayed as a transferable one even if the two
       contracts are ever merged by a future deployment. */
    soulbound: isSoulbound(kind),
  };

  const domain = {
    name: CLAIM_DOMAIN_NAME,
    version: CLAIM_DOMAIN_VERSION,
    chainId: config.chain.id,
    verifyingContract,
  };

  const account = privateKeyToAccount(config.signerKey);
  const signature = await account.signTypedData({
    domain,
    types: CLAIM_TYPES,
    primaryType: "Claim",
    message: {
      to: message.to,
      tokenId: BigInt(message.tokenId),
      amount: BigInt(message.amount),
      nonce: message.nonce,
      deadline: BigInt(message.deadline),
      soulbound: message.soulbound,
    },
  });

  return { domain, types: CLAIM_TYPES, primaryType: "Claim", message, signature };
}
