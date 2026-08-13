import "server-only";
import { getFlag } from "@/lib/flags";
import { rpcUrl } from "@/lib/chain/rpc";

/* Where the market's money moves, read from the environment.
 *
 * FOUNDER-ONLY, AND THAT IS WHY THIS FILE IS SHAPED THE WAY IT IS. The pay
 * token, the chain and the Coffers address are decisions with real money
 * attached, so this module is built to be completely absent-safe: with nothing
 * configured it returns null and every route above it answers 503 with an
 * honest sentence. It never guesses a token, never falls back to a testnet
 * that looks like mainnet, and never invents an address. The same posture
 * lib/chain/mint-config.ts takes, for the same reason: a payment sent to the
 * wrong address is a member's money gone, permanently, with nobody able to
 * return it because nobody is holding it.
 *
 * WHY A STABLECOIN, AND ONLY A STABLECOIN
 * The market quotes in dollars because the whole realm quotes in dollars, and
 * it settles in a dollar stablecoin so the quote and the settlement are the
 * same number. Paying in a floating asset would need an exchange rate, a rate
 * needs an oracle, and a rate read at listing time and honoured at settlement
 * time is an invented figure wearing a price tag. Cents convert to token base
 * units by exact integer arithmetic and nothing else.
 *
 * WHY THE DECIMALS ARE REQUIRED AND NOT DEFAULTED
 * USDC has six decimals on Base and it would be easy to default to that. It is
 * also how a member pays a million times too much. A wrong decimals value does
 * not fail, it succeeds at the wrong magnitude, and the buyer meets the result
 * in their own wallet after signing. So the value is named explicitly or the
 * market is not configured at all.
 */

export type MarketChain = {
  id: number;
  name: string;
  explorer: string;
  rpcUrl: string;
};

export type MarketPayToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

export type MarketConfig = {
  chain: MarketChain;
  token: MarketPayToken;
  /* The Coffers. The protocol fee is paid here by the buyer, in their own
     transaction, as disclosed revenue. Nothing belonging to a seller ever
     arrives at this address. */
  feeWallet: `0x${string}`;
};

/* The two chains the realm settles on, the same pair the mint uses and chosen
   in docs/RAVENSPIRE-V2.md section 28.3: Base, and Base Sepolia for the
   rehearsal. A member should never have to hold a card on one chain and pay
   for it on another. */
const CHAINS: Record<number, Omit<MarketChain, "rpcUrl">> = {
  8453: { id: 8453, name: "Base", explorer: "https://basescan.org" },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
  },
};

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function address(raw: string | undefined): `0x${string}` | null {
  if (!raw || !ADDRESS_RE.test(raw.trim())) return null;
  /* Lowercased once, here, so every comparison downstream (the database check
     constraint, the receipt logs, the listing row) is against the same
     spelling. Mixed-case checksummed addresses that differ only in case have
     burned better codebases than this one. */
  return raw.trim().toLowerCase() as `0x${string}`;
}

/* The whole configuration, or null. Never partial: a pay token without a fee
   wallet is not a working half of a market, it is a route that fails deeper in
   with a worse message. */
export function marketConfig(): MarketConfig | null {
  const chainId = Number(process.env.MARKET_CHAIN_ID);
  const base = CHAINS[chainId];
  if (!base) return null;

  /* Reading receipts is what makes a payment provable, so a chain the realm
     cannot read is a chain the market cannot settle on. Refusing here is far
     better than accepting a listing and discovering it at settlement, with the
     buyer's money already sent. */
  const url = rpcUrl(base.id);
  if (!url) return null;

  const token = address(process.env.MARKET_PAY_TOKEN);
  const feeWallet = address(process.env.MARKET_FEE_WALLET);
  if (!token || !feeWallet) return null;

  const decimals = Number(process.env.MARKET_PAY_TOKEN_DECIMALS);
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 36) return null;

  const symbol = process.env.MARKET_PAY_TOKEN_SYMBOL?.trim();
  if (!symbol) return null;

  return {
    chain: { ...base, rpcUrl: url },
    token: { address: token, symbol, decimals },
    feeWallet,
  };
}

/* The gate every market route passes through.
 *
 * Two locks, both of which must be open, and they are deliberately different
 * things. `market_live` is the founder's decision that the realm is ready to
 * let members trade with each other; the configuration is the pay token and
 * the Coffers address actually existing. Either one alone means sealed, and
 * the two report differently because they are different situations: a sealed
 * chapter is a product state a member should see explained, while a missing
 * pay token is an operational fault nobody outside the realm should have to
 * interpret. Exactly the shape lib/collectibles/claims.ts uses for the mint,
 * and the same 423 the chest route answers with. */
export type MarketGate =
  | { open: true; config: MarketConfig }
  | { open: false; status: 423; reason: string }
  | { open: false; status: 503; reason: string };

export async function marketGate(): Promise<MarketGate> {
  const live = await getFlag("market_live");
  if (!live) {
    return {
      open: false,
      status: 423,
      reason: "The Bazaar is sealed until members hold cards to trade",
    };
  }
  const config = marketConfig();
  if (!config) {
    return {
      open: false,
      status: 503,
      reason: "The Bazaar is not configured yet",
    };
  }
  return { open: true, config };
}

/* The member's own wallet, lowercased, or null. Every payment leg is checked
   against this address and nothing else: not an address in the request body,
   not an address a client asks for. A seller paid at an address they did not
   prove they hold is a seller who was not paid. */
export function ownWallet(
  walletAddress: string | null | undefined
): `0x${string}` | null {
  const raw = walletAddress?.trim();
  if (!raw || !ADDRESS_RE.test(raw)) return null;
  return raw.toLowerCase() as `0x${string}`;
}
