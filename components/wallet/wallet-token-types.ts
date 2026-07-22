/* Shared, client-safe shape for a token row in the Vault. Kept free of any
   server-only imports so both the balances route and client components can use
   it without leaking server code into the browser bundle. */
export interface WalletToken {
  key: string;
  chainId: number;
  chainName: string;
  chainShort: string;
  symbol: string;
  name: string;
  contract: string | null;
  isNative: boolean;
  decimals: number;
  balanceRaw: string;
  balanceDisplay: string;
  quoteUsd: number;
  priceUsd: number;
  change24h: number;
  logo: string | null;
}
