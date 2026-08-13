"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { cx } from "@/components/ui/cx";
import { realmFetch } from "@/lib/auth/api";
import {
  CONSOLE_BODY,
  CONSOLE_META,
  CONSOLE_ROW,
  ConsoleStack,
  ConsoleStat,
} from "@/components/console/console-shell";
import type { RevenueStream } from "@/lib/economy/revenue";
import type { Reconciliation, StreamTotal } from "@/lib/economy/earnings";

/* THE COFFERS, as a Console.

   A money surface, so section 2's Console rules apply without exception:
   compact above `md`, right aligned tabular figures, hairline dividers,
   ornament budget zero. Nothing here glows. A member reading what they have
   earned is operating an instrument, not being congratulated.

   TWO LEDGERS, TWO TABS, NEVER ONE NUMBER. The realm tab is POINTS, a score.
   The wallet tab is value that has already arrived in the member's own wallet,
   in the units it arrived in. They are deliberately not summed and deliberately
   not converted into each other, because there is no rate and inventing one
   would be the largest lie this product could tell.

   THERE IS NO CLAIM BUTTON, AND THAT IS THE DESIGN. A claim button implies a
   balance the realm is holding for you. The realm is holding nothing: every
   figure on the wallet tab is money that went from a payer's wallet to yours in
   the payer's own signed transaction, and every row carries the hash that
   proves it. The absence is stated on the surface rather than left to be
   noticed, because a member who has used any other creator platform will look
   for the button. */

interface CoffersResponse {
  points: {
    balance: number;
    glory: number;
    earned: number;
    spent: number;
    given: number;
    streams: StreamTotal[];
    stakes: {
      staked: number;
      returned: number;
      pardoned: number;
      net: number;
      open: number;
      openCalls: number;
      burned: number;
    };
    events: number;
    firstAt: string | null;
    lastAt: string | null;
    reconciliation: Reconciliation;
    reconciliationLine: string;
  };
  value: {
    tributes: { chainId: number | null; token: string; amount: string; count: number }[];
    bazaarMinor: number;
    bazaarSales: number;
    entries: {
      kind: "tribute" | "bazaar-sale";
      amount: string;
      unit: string;
      at: string;
      txHash: string | null;
      chainId: number | null;
    }[];
    unreadable: number;
    unverified: number;
  };
  streams: RevenueStream[];
  error?: string;
}

type Tab = "realm" | "wallet" | "terms";

const num = new Intl.NumberFormat("en-US");

function usd(minor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(minor / 100);
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function dayLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* A share, as a percentage a member can check. Basis points are the unit the
   code settles in and are not a unit anybody reads. */
function sharePercent(bps: number): string {
  const whole = bps / 100;
  return Number.isInteger(whole) ? `${whole}%` : `${whole.toFixed(2)}%`;
}

export function CoffersConsole() {
  const [data, setData] = useState<CoffersResponse | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("realm");

  const load = useCallback(async () => {
    const res = await realmFetch<CoffersResponse>("/api/coffers");
    setStatus(res.status);
    setData(res.ok ? res.data : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 401) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to read your Coffers"
        body="A member's earnings record is their own. There is no way to read somebody else's."
        bordered
      />
    );
  }

  /* Sealed, not missing. A member is told the chapter has not opened rather
     than that the page does not exist. */
  if (status === 423) {
    return (
      <EmptyState
        icon="lock"
        title="The Coffers are sealed"
        body="The earnings record opens with the chapters that fill it. Nothing is being withheld: there is nothing in it yet."
        bordered
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="alert"
        title="The Coffers could not be read"
        body="The realm could not reach your ledger just now. Nothing has changed."
        bordered
      />
    );
  }

  return (
    <ConsoleStack>
      <SegmentedControl
        label="Coffers view"
        block
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        items={[
          { value: "realm", label: "In the realm" },
          { value: "wallet", label: "In your wallet" },
          { value: "terms", label: "What pays you" },
        ]}
      />

      {tab === "realm" ? <RealmTab points={data.points} /> : null}
      {tab === "wallet" ? <WalletTab value={data.value} /> : null}
      {tab === "terms" ? <TermsTab streams={data.streams} /> : null}
    </ConsoleStack>
  );
}

/* ------------------------------------------------------------------
   The realm ledger: POINTS
   ------------------------------------------------------------------ */

function RealmTab({ points }: { points: CoffersResponse["points"] }) {
  const { stakes } = points;
  const hasStaked = stakes.staked > 0 || stakes.open > 0;

  return (
    <ConsoleStack>
      <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
        <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
          Balance
        </p>
        <p className="tnum mt-1 font-display text-3xl font-semibold text-bone md:text-2xl">
          {num.format(points.balance)}
          <span className="ml-2 text-sm font-semibold text-gold">POINTS</span>
        </p>
        {/* Rule 7, and the reason this line replaced the one that was here. The
            surface used to print "Points convert to $RSP at TGE" under this
            figure, which is a conversion the product has never committed to and
            is not entitled to imply. */}
        <p className={cx(CONSOLE_META, "mt-1.5 text-bone-faint")}>
          POINTS are standing in the realm. They are not money, they are not
          $RSP, and the realm does not quote a rate between them and anything.
        </p>
      </Card>

      <Reconciled r={points.reconciliation} line={points.reconciliationLine} />

      <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
        <ConsoleStat label="Earned, all time" value={num.format(points.earned)} tone="strong" />
        {points.spent > 0 ? (
          <ConsoleStat label="Spent" value={`-${num.format(points.spent)}`} />
        ) : null}
        {points.given > 0 ? (
          <ConsoleStat label="Given to your House" value={`-${num.format(points.given)}`} />
        ) : null}
        <ConsoleStat label="Glory" value={num.format(points.glory)} />
        <ConsoleStat label="Entries" value={num.format(points.events)} />
        {points.firstAt ? (
          <ConsoleStat label="First earned" value={dayLabel(points.firstAt)} />
        ) : null}
      </Card>

      {points.streams.length > 0 ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
            Where it came from
          </p>
          {/* A Board inside a Console: hairline dividers, no zebra, figures
              right aligned and tabular so the column reads down. The slices add
              up to the earned figure exactly, by construction, which is why
              there are no percentages that fail to reach a hundred. */}
          <div className="mt-2 divide-y divide-steel-line">
            {points.streams.map((s) => (
              <div
                key={s.slug}
                className={cx("flex items-center justify-between gap-3", CONSOLE_ROW, CONSOLE_BODY)}
              >
                <span className="min-w-0 truncate text-bone-mut">{s.label}</span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className={cx(CONSOLE_META, "tnum text-bone-faint")}>
                    {num.format(s.events)}
                  </span>
                  <span className="tnum w-20 text-right font-semibold text-bone">
                    {num.format(s.points)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon="coin"
          title="Nothing earned yet"
          body="Send a raven, seal a Call, take the field in the War. Every POINT you earn lands here with the act that earned it beside it."
          bordered
        />
      )}

      {hasStaked ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
            Staked Calls
          </p>
          <p className={cx(CONSOLE_META, "mt-1 text-bone-faint")}>
            A stake is your own balance at risk, not an earning in either
            direction. It is kept out of the figures above on purpose.
          </p>
          <div className="mt-2">
            <ConsoleStat
              label={`Held behind ${num.format(stakes.openCalls)} open ${stakes.openCalls === 1 ? "Call" : "Calls"}`}
              value={num.format(stakes.open)}
              tone="strong"
            />
            <ConsoleStat label="Put at risk, all time" value={num.format(stakes.staked)} />
            <ConsoleStat label="Returned on settlement" value={num.format(stakes.returned)} />
            {stakes.pardoned > 0 ? (
              <ConsoleStat
                label="Refunded by a Warden's Pardon"
                value={num.format(stakes.pardoned)}
              />
            ) : null}
            <ConsoleStat label="Burned" value={num.format(stakes.burned)} />
          </div>
        </Card>
      ) : null}
    </ConsoleStack>
  );
}

/* The reconciliation, said out loud.

   Nothing else in this product tells a member when its own bookkeeping does not
   add up. `points_ledger` is the source of truth and `profiles.points` is a
   cached total, so a drift between them is a real fact, and the member is the
   person most entitled to know. A surface that quietly showed the cached number
   and hoped is how the four defects this replaces survived. */
function Reconciled({ r, line }: { r: Reconciliation; line: string }) {
  const bad = !r.reconciled && !r.partial;
  return (
    <Card
      variant="raised"
      pad="none"
      radius="lg"
      tone={bad ? "ember" : undefined}
      className="flex items-start gap-2.5 px-4 py-3"
    >
      {/* text-state-danger rather than text-ember: --ember is 4.3:1 on the
          panel and the tokens that carry meaning next to text come off the
          AA-safe twins (rule 11). */}
      <Icon
        name={bad ? "alert" : r.partial ? "info" : "check"}
        className={cx("mt-0.5 h-4 w-4 shrink-0", bad ? "text-state-danger" : "text-gold")}
      />
      <p className={cx(CONSOLE_META, "leading-relaxed text-bone-mut")}>{line}</p>
    </Card>
  );
}

/* ------------------------------------------------------------------
   The value ledger: money already in the member's own wallet
   ------------------------------------------------------------------ */

function WalletTab({ value }: { value: CoffersResponse["value"] }) {
  const nothing =
    value.tributes.length === 0 && value.bazaarSales === 0 && value.entries.length === 0;

  return (
    <ConsoleStack>
      <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
        <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
          What has reached you
        </p>
        <p className="mt-2 text-sm leading-relaxed text-bone-mut">
          Everything below is already in your own wallet. The realm is not
          holding a balance for you and there is nothing here to claim: each
          payment went straight from the payer&apos;s wallet to yours, in their
          own signed transaction, and never passed through the platform.
        </p>
      </Card>

      {nothing ? (
        <EmptyState
          icon="wallet"
          title="Nothing has been paid to you yet"
          body="A tribute from another member and a card sold in the Bazaar are the two things that pay real value, and both arrive in your wallet directly. When one does, it appears here with the transaction that proves it."
          bordered
        />
      ) : null}

      {value.tributes.length > 0 ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
            Tributes received
          </p>
          <div className="mt-2 divide-y divide-steel-line">
            {value.tributes.map((t) => (
              <div
                key={`${t.chainId ?? "none"}-${t.token}`}
                className={cx("flex items-center justify-between gap-3", CONSOLE_ROW, CONSOLE_BODY)}
              >
                <span className="min-w-0 truncate text-bone-mut">
                  {t.token}
                  <span className={cx(CONSOLE_META, "ml-2 text-bone-faint")}>
                    {num.format(t.count)} {t.count === 1 ? "tribute" : "tributes"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-right font-semibold text-bone">
                  {t.amount}
                </span>
              </div>
            ))}
          </div>
          {/* No dollar figure is put on a token amount. The realm did not record
              a price at the moment of the tribute and a price read today and
              applied to a payment made in March is an invented number with a
              currency symbol on it. */}
          <p className={cx(CONSOLE_META, "mt-2 text-bone-faint")}>
            Shown in the token that was sent. The realm does not price these:
            it never recorded what they were worth at the moment they arrived,
            and a rate read today would be a figure it made up.
          </p>
        </Card>
      ) : null}

      {value.bazaarSales > 0 ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
            Sold in the Bazaar
          </p>
          <div className="mt-2">
            <ConsoleStat
              label={`${num.format(value.bazaarSales)} ${value.bazaarSales === 1 ? "sale" : "sales"} settled`}
              value={usd(value.bazaarMinor)}
              tone="strong"
            />
          </div>
          <p className={cx(CONSOLE_META, "mt-1.5 text-bone-faint")}>
            Your 95% of each price, paid to your wallet by the buyer. Priced in
            dollars because the market quotes and settles in dollars.
          </p>
        </Card>
      ) : null}

      {value.entries.length > 0 ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
            Every entry, and its proof
          </p>
          <div className="mt-2 divide-y divide-steel-line">
            {value.entries.map((e, i) => (
              <div
                key={`${e.txHash ?? "none"}-${i}`}
                className={cx("flex items-center justify-between gap-3", CONSOLE_ROW, CONSOLE_BODY)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-bone-mut">
                    {e.kind === "tribute" ? "Tribute" : "Bazaar sale"}
                  </span>
                  <span className={cx(CONSOLE_META, "tnum block truncate text-bone-faint")}>
                    {dayLabel(e.at)}
                    {e.txHash ? ` · ${shortHash(e.txHash)}` : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 text-right font-semibold text-bone">
                  {e.unit === "usd-minor"
                    ? usd(Number(e.amount) || 0)
                    : `${e.amount} ${e.unit}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {value.unverified > 0 || value.unreadable > 0 ? (
        <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
          {value.unverified > 0 ? (
            <p className={cx(CONSOLE_META, "leading-relaxed text-bone-faint")}>
              {num.format(value.unverified)}{" "}
              {value.unverified === 1 ? "tribute is" : "tributes are"} recorded
              but not yet proven against the chain, so{" "}
              {value.unverified === 1 ? "it is" : "they are"} not counted above.
              An unproven receipt is a claim, not a payment.
            </p>
          ) : null}
          {value.unreadable > 0 ? (
            <p className={cx(CONSOLE_META, "mt-1.5 leading-relaxed text-bone-faint")}>
              {num.format(value.unreadable)}{" "}
              {value.unreadable === 1 ? "entry" : "entries"} could not be read
              and{" "}
              {value.unreadable === 1 ? "is" : "are"} missing from the totals.
              The figures above are short by that much rather than wrong.
            </p>
          ) : null}
        </Card>
      ) : null}
    </ConsoleStack>
  );
}

/* ------------------------------------------------------------------
   The terms
   ------------------------------------------------------------------ */

function TermsTab({ streams }: { streams: RevenueStream[] }) {
  return (
    <ConsoleStack>
      <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
        <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
          Every surface, and what it pays you
        </p>
        <p className="mt-2 text-sm leading-relaxed text-bone-mut">
          A share is paid by whoever is paying, at the moment they pay, into
          your own wallet. The realm never collects your share first and sends
          it on afterwards, because holding money it owed you would make it your
          custodian. That is why some surfaces below pay nothing at all: not
          because the money is not real, but because it cannot reach you without
          being held on the way.
        </p>
      </Card>

      {streams.map((s) => (
        <Card key={s.slug} variant="raised" pad="none" radius="lg" className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-bone">{s.name}</p>
              <p className={cx(CONSOLE_META, "mt-0.5 truncate text-bone-faint")}>
                {s.payer}
              </p>
            </div>
            <span
              className={cx(
                "tnum shrink-0 rounded-sm border px-2 py-1 text-xs font-semibold",
                s.memberShareBps > 0
                  ? "border-gold/50 bg-gold/10 text-gold-bright"
                  : "border-steel-line bg-void text-bone-faint"
              )}
            >
              {s.producesRevenue ? sharePercent(s.memberShareBps) : "No money"}
            </span>
          </div>
          <p className={cx(CONSOLE_BODY, "mt-2 leading-relaxed text-bone-mut")}>
            {s.terms}
          </p>
          {s.waitingOn ? (
            <p
              className={cx(
                CONSOLE_META,
                "mt-2 flex items-start gap-1.5 rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 leading-relaxed text-bone-faint"
              )}
            >
              <Icon name="lock" className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
              <span>{s.waitingOn}</span>
            </p>
          ) : null}
        </Card>
      ))}
    </ConsoleStack>
  );
}
