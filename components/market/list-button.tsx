"use client";

import { useCallback, useMemo, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { formatMoney, money, splitFee } from "@/lib/commerce/money";

/* THE LISTING CONTROL: putting a card on the Bazaar, from the trophy case.
 *
 * WHY IT LIVES ON THE HOARD. Selling starts where a member is looking at what
 * they own, in the same place they notice they hold four of one rare. The
 * crafting bench earned its slot on the Hoard for exactly that reason and this
 * is the same argument: a market control that only exists on the market is a
 * control nobody finds.
 *
 * THE WHOLE FEE, BEFORE ANYTHING IS SIGNED. The sheet prints three numbers: the
 * price the buyer pays, the protocol fee, and what the seller receives. All
 * three are visible before the button can be pressed, and they are computed
 * from the same integer arithmetic the server uses (lib/commerce/money.ts), so
 * the preview and the listing cannot disagree by a cent. A fee a member
 * discovers after the fact is a fee hidden in a spread, whatever it is called.
 *
 * WHAT THE MEMBER NAMES: a price. Not the fee, not the split, not the card's
 * rarity. The server derives all of those from the holdings ledger and refuses
 * the listing if they do not match what it computed itself.
 *
 * NO SUGGESTED PRICE, AND THAT IS DELIBERATE. There is no "cards like this sell
 * for", no floor value beside the field, and no estimate. The realm does not
 * know what a card is worth, and the per rarity floor is what the platform
 * commits to standing behind rather than what anybody will pay. Printing it
 * here would be quoting it as a price whatever the label said.
 */

export interface ListTerms {
  fee_bps: number;
  min_price_minor: number;
  max_price_minor: number;
}

type ListResponse = {
  listing?: { id: string; price_minor: number };
  error?: string;
};

/* The fee as a percentage, written the way a member would say it: "5" rather
   than "5.00", and two decimals for a rate that genuinely has them. */
export function feePercentLabel(bps: number): string {
  return bps % 100 === 0 ? String(bps / 100) : (bps / 100).toFixed(2);
}

/* A dollar amount typed by a human, as an exact integer count of cents.
 *
 * Parsed from the string rather than through parseFloat, because parseFloat is
 * where 12.10 becomes 1209.9999999999998 and a member's price ends up a cent
 * under what they typed. The digits are combined as integers and nothing here
 * ever holds a fractional number. Null for anything that is not a plain amount,
 * which the field then refuses rather than guessing at. */
function dollarsToMinor(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = (fraction + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

export function ListButton({
  copy,
  terms,
  label = "Sell on the Bazaar",
  size = "sm",
  onListed,
}: {
  copy: { id: string; name: string; cardNumber: number; rarity: string };
  terms: ListTerms;
  label?: string;
  size?: "sm" | "md" | "lg";
  onListed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const minor = useMemo(() => dollarsToMinor(price), [price]);
  const feeLabel = feePercentLabel(terms.fee_bps);

  /* The split, previewed with the server's own arithmetic. Absent rather than
     zeroed while the field is empty: a fee of $0.00 beside an empty price
     reads as a promise that selling is free. */
  const quote = useMemo(() => {
    if (minor === null) return null;
    if (minor < terms.min_price_minor || minor > terms.max_price_minor) return null;
    return splitFee(minor, terms.fee_bps);
  }, [minor, terms]);

  const submit = useCallback(async () => {
    if (!quote || busy) return;
    setBusy(true);
    setProblem(null);
    const res = await realmFetch<ListResponse>("/api/market", {
      method: "POST",
      json: { inventory_id: copy.id, price_minor: quote.totalMinor },
    });
    setBusy(false);
    if (!res.ok || !res.data?.listing) {
      /* The server's own words. They are written for members, and they are the
         only ones that know why a particular listing was refused. */
      setProblem(res.data?.error ?? "That card could not be listed");
      return;
    }
    setOpen(false);
    setPrice("");
    onListed?.();
  }, [quote, busy, copy.id, onListed]);

  const outOfRange =
    minor !== null &&
    (minor < terms.min_price_minor || minor > terms.max_price_minor);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setProblem(null);
      }}
      size="sm"
      title="Sell on the Bazaar"
      description={`${copy.name}, number ${copy.cardNumber}. You name the price, the buyer pays you directly.`}
      trigger={
        <Button size={size} dense>
          <Icon name="coin" className="h-3.5 w-3.5 text-gold" />
          {label}
        </Button>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button
            variant="gold"
            disabled={!quote || busy}
            onClick={() => void submit()}
          >
            {busy ? "Listing" : "List it"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Your price"
          description={`Between ${formatMoney(money(terms.min_price_minor))} and ${formatMoney(money(terms.max_price_minor))}, in US dollars.`}
          {...(outOfRange ? { error: "That is outside the Bazaar's range" } : {})}
        >
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setProblem(null);
            }}
            aria-label="Your price in dollars"
          />
        </Field>

        {/* The three numbers, all of them, before anything is committed. The
            whole block is absent until there is a real price to split: a fee
            of $0.00 sitting beside an empty field reads as a promise that
            selling is free, which is the exact opposite of what this panel is
            for. */}
        {quote ? (
          <dl className="flex flex-col gap-1.5 rounded-md border border-steel-line bg-void/60 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-bone-mut">The buyer pays</dt>
              <dd className="tnum text-sm font-semibold text-bone">
                {formatMoney(money(quote.totalMinor))}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-bone-mut">
                Protocol fee, {feeLabel}%, to the Exchequer
              </dt>
              <dd className="tnum text-sm text-bone-mut">
                {formatMoney(money(quote.feeMinor))}
              </dd>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-steel-line pt-1.5">
              <dt className="text-xs font-semibold text-bone">You receive</dt>
              <dd className="tnum text-sm font-semibold text-gold">
                {formatMoney(money(quote.netMinor))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-bone-faint">
            Name a price and the Bazaar will show you the fee and what you take
            home, before you list anything.
          </p>
        )}

        {/* The one sentence that matters about how this works. A member should
            not have to read a policy page to learn that nobody holds their
            money or their card. */}
        <p className="text-xs leading-relaxed text-bone-faint">
          The card stays yours until somebody pays for it. The buyer pays your
          own wallet directly, and the realm never holds the card or the money
          at any point. You can withdraw the listing whenever you like, unless
          somebody is mid-purchase.
        </p>

        {problem ? (
          <p className="text-xs leading-snug text-state-danger">{problem}</p>
        ) : null}
      </div>
    </Modal>
  );
}
