import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export type Holding = {
  symbol: string;
  balance: number | null;
  quoteUsd: number | null;
};

export type RealmPulse = {
  tone: "rising" | "falling" | "mixed" | "quiet";
  green: number;
  red: number;
  total: number;
  avgChange: number | null;
  symbols: string[];
};

function fmtPrice(n: number | null): string {
  if (n === null) return "n/a";
  if (n >= 1)
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

function fmtCompact(n: number | null): string | null {
  if (n === null) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtUsd(n: number | null): string {
  if (n === null) return "n/a";
  const c = fmtCompact(n);
  return c ?? "0";
}

export function truncateAddress(addr: string): string {
  const a = addr.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}..${a.slice(-4)}`;
}

export function PriceMiniCard({
  symbol,
  name,
  priceUsd,
  change24h,
  marketCap,
  chain,
  volume24h,
  dexUrl,
  swapHref,
}: {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  chain: string | null;
  volume24h?: number | null;
  dexUrl?: string | null;
  swapHref?: string;
}) {
  const up = change24h !== null && change24h >= 0;
  const cap = fmtCompact(marketCap);
  const vol = volume24h != null ? fmtCompact(volume24h) : null;
  return (
    <div className="glass-sm glass-hover flex min-w-[212px] flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-bone">
            ${symbol.toUpperCase()}
          </p>
          <p className="truncate text-[11px] text-bone-faint">{name}</p>
        </div>
        <Icon name="coin" className="h-4 w-4 shrink-0 text-gold" />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tnum text-sm font-semibold text-bone">
          {priceUsd !== null ? `$${fmtPrice(priceUsd)}` : "No price"}
        </span>
        {change24h !== null && (
          <span
            className={`tnum inline-flex items-center gap-1 text-xs font-semibold ${
              up ? "text-gold-bright" : "text-ember-deep"
            }`}
          >
            <Icon
              name="arrow"
              className={`h-3 w-3 ${up ? "-rotate-90" : "rotate-90"}`}
            />
            {up ? "+" : ""}
            {change24h.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-bone-mut">
        <span className="tnum">{cap ? `MC $${cap}` : "MC unknown"}</span>
        {vol && <span className="tnum">Vol ${vol}</span>}
        {chain && (
          <span className="uppercase tracking-[0.14em] text-bone-faint">
            {chain}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {swapHref && (
          <Link
            href={swapHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-panel-warm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:border-gold/50 hover:text-gold-bright"
          >
            <Icon name="repost" className="h-3 w-3" />
            Swap
          </Link>
        )}
        {dexUrl && (
          <a
            href={dexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-steel-line/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bone-faint transition-colors hover:border-gold/40 hover:text-gold"
          >
            <Icon name="eye" className="h-3 w-3" />
            Chart
          </a>
        )}
      </div>
    </div>
  );
}

const PULSE_COPY: Record<RealmPulse["tone"], { label: string; read: string }> = {
  rising: { label: "Winds rising", read: "green outweighs red across these names" },
  falling: { label: "Winds falling", read: "red outweighs green across these names" },
  mixed: { label: "Crosswinds", read: "the field is split, no clear direction" },
  quiet: { label: "Still air", read: "little movement on the tape" },
};

/**
 * A premium "Realm Pulse" summary of the tokens a member asked about. Every
 * figure is derived from real 24h data upstream, never invented here.
 */
export function RealmPulseCard({ pulse }: { pulse: RealmPulse }) {
  const copy = PULSE_COPY[pulse.tone];
  const avgUp = pulse.avgChange !== null && pulse.avgChange >= 0;
  return (
    <div className="glass-sm flex min-w-[212px] max-w-[320px] flex-col gap-2 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="signal" className="h-4 w-4 shrink-0 text-gold" />
          <span className="font-display text-sm font-semibold text-bone">
            Realm Pulse
          </span>
        </div>
        <span className="rounded-full border border-steel-line/70 bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-bone-faint">
          {copy.label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-b border-steel-line/60 pb-2">
        <span className="text-[11px] text-bone-mut">{copy.read}</span>
        {pulse.avgChange !== null && (
          <span
            className={`tnum text-xs font-semibold ${
              avgUp ? "text-gold-bright" : "text-ember-deep"
            }`}
          >
            {avgUp ? "+" : ""}
            {pulse.avgChange.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-bone-mut">
        <span className="tnum">
          <span className="text-gold-bright">{pulse.green} up</span>
          {" / "}
          <span className="text-ember-deep">{pulse.red} down</span>
        </span>
        <span className="truncate uppercase tracking-[0.12em] text-bone-faint">
          {pulse.symbols.slice(0, 4).join(" ")}
        </span>
      </div>
    </div>
  );
}

/**
 * Tappable follow-up suggestions. Backward-compatible, presentational only:
 * the parent decides what happens on select.
 */
export function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="inline-flex items-center gap-1.5 rounded-full border border-steel-line/70 bg-panel px-3 py-1 text-[11px] text-bone-mut transition-colors hover:border-gold/40 hover:text-gold"
        >
          <Icon name="arrow" className="h-3 w-3 shrink-0 text-gold/70" />
          {s}
        </button>
      ))}
    </div>
  );
}

export function WalletMiniCard({
  address,
  totalUsd,
  holdings,
}: {
  address: string;
  totalUsd: number | null;
  holdings: Holding[];
}) {
  const rows = holdings.slice(0, 5);
  return (
    <div className="glass-sm flex min-w-[240px] max-w-[320px] flex-col gap-2.5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="wallet" className="h-4 w-4 shrink-0 text-gold" />
          <span className="tnum truncate text-sm font-semibold text-bone">
            {truncateAddress(address)}
          </span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-b border-steel-line/60 pb-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-bone-faint">
          Total
        </span>
        <span className="tnum text-sm font-semibold text-gold-bright">
          {totalUsd !== null ? `$${fmtUsd(totalUsd)}` : "n/a"}
        </span>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((h, i) => (
            <li
              key={`${h.symbol}-${i}`}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate text-xs font-semibold text-bone">
                {h.symbol.toUpperCase()}
              </span>
              <div className="flex shrink-0 items-baseline gap-2.5">
                {h.balance !== null && (
                  <span className="tnum text-[11px] text-bone-faint">
                    {fmtCompact(h.balance) ?? "0"}
                  </span>
                )}
                <span className="tnum text-xs font-semibold text-bone-mut">
                  {h.quoteUsd !== null ? `$${fmtUsd(h.quoteUsd)}` : "n/a"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-bone-faint">
          No holdings surfaced for this address.
        </p>
      )}
    </div>
  );
}
