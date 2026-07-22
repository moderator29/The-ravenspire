/* Client-safe shapes shared between The Coffers UI and its API routes. Kept
   free of any server-only imports so client components can import these types
   without pulling server code into the browser bundle. */

/* Compact, sanitized holding row for a member's public/own positions. No raw
   address or internal balance fields, just what a holdings list renders. */
export interface PositionToken {
  key: string;
  symbol: string;
  name: string;
  logo: string | null;
  chainShort: string;
  amount: string;
  valueUsd: number;
  change24h: number;
  native: boolean;
}
