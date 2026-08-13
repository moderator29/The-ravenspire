import "server-only";
import { getFlag } from "@/lib/flags";
import { mintConfig, type MintConfig } from "@/lib/chain/mint-config";

/* The gate every claim route passes through, and the shapes they share.
 *
 * Two locks, both of which must be open, and they are deliberately different
 * things. `mint_live` is the founder's decision that the realm is ready to
 * mint; the configuration is the founder's contracts and signing key actually
 * existing. Either one alone means sealed, and the two report differently
 * because they are different situations: a sealed chapter is a product state a
 * member should see explained, while a missing signer is an operational fault
 * nobody outside the realm should have to interpret.
 *
 * Nothing on-chain is retractable, which is why this is a shared module rather
 * than a check copied into three routes. A route that forgets the gate is a
 * route that signs a voucher against an unconfigured contract.
 */

export type MintGate =
  | { open: true; config: MintConfig }
  /* 423 Locked: the resource exists, the caller is known, the door is sealed.
     Distinct from 403 (never yours) and 404 (never real) so the client can
     honestly render "coming soon" rather than "forbidden". The same code the
     chest route answers with while chests_live is false. */
  | { open: false; status: 423; reason: string }
  /* 503: the realm intends to answer and cannot. Never dressed up as a
     product state, because it is not one. */
  | { open: false; status: 503; reason: string };

export async function mintGate(): Promise<MintGate> {
  const live = await getFlag("mint_live");
  if (!live) {
    return {
      open: false,
      status: 423,
      reason: "The mint is sealed until the set is final",
    };
  }
  const config = mintConfig();
  if (!config) {
    return {
      open: false,
      status: 503,
      reason: "The mint is not configured yet",
    };
  }
  return { open: true, config };
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/* The member's own wallet, lowercased, or null. Every claim is bound to this
   address and nothing else: not an address in the request body, not an address
   the client asks for. A voucher issued to an address the member did not prove
   they hold is a voucher issued to whoever asked. */
export function ownWallet(walletAddress: string | null | undefined): `0x${string}` | null {
  const raw = walletAddress?.trim();
  if (!raw || !ADDRESS_RE.test(raw)) return null;
  return raw.toLowerCase() as `0x${string}`;
}

/* The set slug a crest claim records. A crest belongs to the realm rather than
   to a printed set, and it still needs a set column, so it gets a name of its
   own rather than a null that every reader has to remember to handle. */
export const CREST_SET_SLUG = "crests";

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* The columns a claim is read back with. One list, because three routes return
   claims and a shape that drifts between them is a client bug waiting to
   happen. The signer key appears nowhere in it, and neither does anything else
   that is not the member's own business. */
export const CLAIM_COLUMNS =
  "id, subject_kind, inventory_id, set_slug, item_slug, wallet_address, chain_id, contract, token_id, voucher, status, tx_hash, verified_at, expires_at, created_at";

export type ClaimRow = {
  id: string;
  subject_kind: "card" | "crest";
  inventory_id: string | null;
  set_slug: string;
  item_slug: string;
  wallet_address: string;
  chain_id: number;
  contract: string;
  token_id: string;
  voucher: unknown;
  status: "issued" | "submitted" | "minted" | "expired" | "void";
  tx_hash: string | null;
  verified_at: string | null;
  expires_at: string;
  created_at: string;
};
