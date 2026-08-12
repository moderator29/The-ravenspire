import "server-only";

/* Where the realm's collectibles live on-chain, read from the environment.
 *
 * FOUNDER-ONLY, AND THAT IS WHY THIS FILE IS SHAPED THE WAY IT IS.
 * Deploying the two contracts and holding the voucher signing key are founder
 * decisions with real money and permanent consequences attached, so this
 * module is built to be completely absent-safe. When nothing is configured it
 * returns null and every route above it answers 503 with an honest sentence.
 * It never guesses a chain, never falls back to a testnet that looks like
 * mainnet, and never invents an address. A claim against the wrong contract is
 * a token minted into a place nobody will ever look.
 *
 * Nothing on-chain is retractable, so the order is deliberate: the flag
 * (mint_live) and the configuration must BOTH be present before a single
 * voucher is signed. Either one alone means sealed.
 */

import { crestTokenId } from "@/lib/collectibles/token-ids";

export type MintChain = {
  id: number;
  name: string;
  rpcUrl: string;
  explorer: string;
};

export type MintConfig = {
  chain: MintChain;
  /* The transferable ERC-1155 that holds the cards. */
  cardContract: `0x${string}`;
  /* The soulbound contract that holds the crests. Separate by design: a
     contract that can be told not to transfer can also be told to. */
  crestContract: `0x${string}`;
  /* The key that signs claim vouchers. Never leaves the server, never appears
     in a response, never gets logged. */
  signerKey: `0x${string}`;
};

/* The two chains this realm will ever mint on: Base, and Base Sepolia for the
   rehearsal. Chosen in docs/RAVENSPIRE-V2.md section 28.3 for cheap gas,
   liquidity, and because the existing Alchemy key already covers both. */
const CHAINS: Record<number, Omit<MintChain, "rpcUrl"> & { alchemy: string }> = {
  8453: {
    id: 8453,
    name: "Base",
    explorer: "https://basescan.org",
    alchemy: "base-mainnet",
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
    alchemy: "base-sepolia",
  },
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

function address(raw: string | undefined): `0x${string}` | null {
  if (!raw || !ADDRESS_RE.test(raw.trim())) return null;
  /* Lowercased once, here, so every comparison downstream (the database check
     constraint, the receipt check, the voucher) is against the same spelling.
     Mixed-case checksummed addresses that differ only in case have burned
     better codebases than this one. */
  return raw.trim().toLowerCase() as `0x${string}`;
}

/* The whole configuration, or null. Never partial: a card contract without a
   signer is not a working half of a mint, it is a route that will fail deeper
   in with a worse message. */
export function mintConfig(): MintConfig | null {
  const chainId = Number(process.env.MINT_CHAIN_ID);
  const base = CHAINS[chainId];
  if (!base) return null;

  const rpcUrl = resolveRpcUrl(base.alchemy);
  if (!rpcUrl) return null;

  const cardContract = address(process.env.MINT_CARD_CONTRACT);
  const crestContract = address(process.env.MINT_CREST_CONTRACT);
  if (!cardContract || !crestContract) return null;

  const signerKey = process.env.MINT_VOUCHER_SIGNER_KEY?.trim();
  if (!signerKey || !PRIVATE_KEY_RE.test(signerKey)) return null;

  return {
    chain: { id: base.id, name: base.name, explorer: base.explorer, rpcUrl },
    cardContract,
    crestContract,
    signerKey: signerKey.toLowerCase() as `0x${string}`,
  };
}

/* An explicit MINT_RPC_URL wins, so a self-hosted node or a different provider
   needs no code change. Otherwise the existing Alchemy key covers both Base
   networks. A public keyless endpoint is deliberately not a fallback: reading
   a receipt off a rate-limited public node is how a confirmed mint gets told
   it did not happen. */
function resolveRpcUrl(alchemyNetwork: string): string | null {
  const explicit = process.env.MINT_RPC_URL?.trim();
  if (explicit) return explicit;
  const key = process.env.ALCHEMY_API_KEY?.trim();
  if (!key) return null;
  return `https://${alchemyNetwork}.g.alchemy.com/v2/${key}`;
}

/* The contract a given kind of claim is minted by. Kept here beside the
   configuration rather than in the routes, so there is exactly one place that
   can send a crest to the transferable contract by mistake. */
export function contractFor(
  config: MintConfig,
  kind: "card" | "crest"
): `0x${string}` {
  return kind === "crest" ? config.crestContract : config.cardContract;
}

/* True when a crest slug can be carried on-chain at all. A crest with no
   frozen token id is held, displayed and counted exactly as before; it simply
   has no mint yet, and the route says so rather than inventing an id. */
export function crestIsMintable(slug: string): boolean {
  return crestTokenId(slug) !== null;
}
