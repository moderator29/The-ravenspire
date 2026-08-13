/* The one function the realm's collectible contracts must expose, and the
 * shape of the call the member's own wallet makes.
 *
 * This is not a client convenience. It is the interface contract between two
 * things that are written by different people at different times: the voucher
 * this codebase signs (lib/chain/claim-voucher.ts) and the contract the
 * founder deploys. If the deployed contract's struct differs from this by a
 * single field or a single ordering, every signature verifies against nothing
 * and every member meets the failure in the worst possible place, in their own
 * wallet, after paying gas. So the struct here and CLAIM_TYPES there are the
 * same six fields in the same order, and neither may be edited alone.
 *
 * WHAT THE CONTRACT MUST DO, stated once so the deployment can be checked
 * against it:
 *   1. Recover the EIP-712 signer of `voucher` under the domain
 *      ("Ravenspire Claim", "1", chainId, address(this)) and require that it
 *      is the realm's voucher signer.
 *   2. Require block.timestamp <= voucher.deadline.
 *   3. Require the nonce is unspent, then mark it spent. This is what makes a
 *      voucher single use even if the platform reissues one by mistake.
 *   4. Require msg.sender == voucher.to. The member mints to themselves and
 *      pays their own gas; nobody mints on anybody's behalf.
 *   5. Mint voucher.amount of voucher.tokenId to voucher.to.
 *   6. On the soulbound contract, refuse every transfer after the mint. A
 *      crest that can be sold is a record of something somebody paid for,
 *      which is a different object with the same picture.
 *
 * Not server-only: the browser encodes this call, because the browser is where
 * the member's wallet is. That is the whole point of the design.
 */

export const CLAIM_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "voucher",
        type: "tuple",
        components: [
          { name: "to", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "soulbound", type: "bool" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
