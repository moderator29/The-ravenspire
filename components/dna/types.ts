/* Shape the DNA Analyzer route returns and the card renders. Kept here so the
   client card and page share it without importing the server-only route. */

export interface DnaDataPoint {
  label: string;
  value: string;
}

export interface DnaResult {
  kind: "wallet" | "social";
  subject: string;
  archetype: string;
  traits: string[];
  narrative: string;
  dataPoints: DnaDataPoint[];
  sparse: boolean;
  shareText: string;
}
