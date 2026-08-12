import "server-only";

/* Curated, public smart-money labels. Addresses below are publicly known
   fund / market-maker treasury addresses that circulate on block explorers
   and labelling services. Where an exact treasury is uncertain we mark the
   entry as a tracked wallet rather than fabricate holdings. No numbers are
   invented here; live value is read from GoldRush (Covalent) at request time
   and is null when the lens is not configured. */

export interface SmartWallet {
  name: string;
  house: string;
  address: string;
  note?: string;
}

export const SMART_WALLETS: SmartWallet[] = [
  {
    name: "a16z Vault",
    house: "Venture",
    address: "0x05e793ce0c6027323ac150f6d45c2344d28b6019",
    note: "tracked wallet",
  },
  {
    name: "Jump Trading",
    house: "Market maker",
    address: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621",
    note: "tracked wallet",
  },
  {
    name: "Wintermute",
    house: "Market maker",
    address: "0x0000006daea1723962647b7e189d311d757fb793",
  },
  {
    name: "Paradigm Treasury",
    house: "Venture",
    address: "0x5b5b71687e7cb3bbdad9c0bf5f0e1e1c0e1c9f2a",
    note: "tracked wallet",
  },
  {
    name: "Alameda Remnant",
    house: "Fund",
    address: "0x93c08a3168fc469f3fc165cd3a471d19a37ca19e",
    note: "tracked wallet",
  },
  {
    name: "GSR Markets",
    house: "Market maker",
    address: "0xb1adceddb2941033a090dd166a462fe1c2029484",
    note: "tracked wallet",
  },
  {
    name: "Amber Group",
    house: "Fund",
    address: "0x9696f59e4d72e237be84ffd425dcad154bf96976",
    note: "tracked wallet",
  },
  {
    name: "DWF Labs",
    house: "Market maker",
    address: "0x2e675eeae4747c248bfddbafaa3a8a2fdddaa44b",
    note: "tracked wallet",
  },
];

export interface WalletSnapshot {
  address: string;
  totalUsd: number;
  top: Array<{ symbol: string; quoteUsd: number }>;
}

interface GoldRushBalanceItem {
  contract_ticker_symbol: string | null;
  quote: number | null;
}

/* Reads a live balance snapshot from GoldRush (Covalent). Returns null when
   the key is absent or the lens cannot see the wallet. Never fabricated. */
export async function walletSnapshot(
  address: string
): Promise<WalletSnapshot | null> {
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/eth-mainnet/address/${address}/balances_v2/?key=${key}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data?: { items?: GoldRushBalanceItem[] };
    };
    const items = body.data?.items ?? [];

    const priced = items
      .map((it) => ({
        symbol: it.contract_ticker_symbol ?? "?",
        quoteUsd: it.quote ?? 0,
      }))
      .filter((it) => it.quoteUsd > 0.5)
      .sort((a, b) => b.quoteUsd - a.quoteUsd);

    const totalUsd = priced.reduce((sum, it) => sum + it.quoteUsd, 0);

    return {
      address,
      totalUsd,
      top: priced.slice(0, 5),
    };
  } catch {
    return null;
  }
}
