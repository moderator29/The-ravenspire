"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import type { ChestTier } from "@/lib/collectibles/warchests";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { PackCeremony } from "@/components/commerce/pack-ceremony";

/* The live Warchests store (V2 Part Two, section 38, slice 1).
 *
 * Rendered only when the server has both unsealed the chapter (chests_live) and
 * confirmed prices. It is server-gated in the page, so the client never has to
 * be trusted with that decision.
 *
 * NO PRICE IS RENDERED HERE. Prices live server-only in lib/commerce/catalog.ts
 * and are never exposed to a client surface (rule 6, real-data-only). The cart
 * selects SKUs and quantities; the server prices the order and the payment
 * provider's own hosted page shows the authoritative total. The member picks
 * what they want, and the exact charge is confirmed at secure checkout, which
 * is also the non-custodial, server-authoritative posture the whole engine
 * takes.
 *
 * Checkout POSTs to /api/commerce/checkout with a client-generated idempotency
 * key, so a double click or a retry is one order and one charge, and redirects
 * to the provider URL the route returns. A cart holding the physical King's
 * Reliquary collects a shipping address for fulfillment.
 */

interface CartLine {
  sku: string;
  qty: number;
}

interface CheckoutResponse {
  orderId?: string;
  url?: string;
  error?: string;
}

const MAX_QTY = 10;

function isPhysical(tier: ChestTier): boolean {
  return tier.kind === "physical";
}

export function WarchestsStore({ tiers }: { tiers: ChestTier[] }) {
  const { ready, authenticated, enabled, signInX } = useRealmAuth();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ceremonySku, setCeremonySku] = useState<string | null>(null);

  const tierBySku = useMemo(
    () => new Map(tiers.map((t) => [t.sku, t] as const)),
    [tiers]
  );
  const ceremonyTier = ceremonySku ? tierBySku.get(ceremonySku) ?? null : null;

  const lines: CartLine[] = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => ({ sku, qty }));
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const hasPhysical = lines.some((l) => {
    const t = tierBySku.get(l.sku);
    return t ? isPhysical(t) : false;
  });

  function setQty(sku: string, qty: number) {
    setCart((prev) => ({
      ...prev,
      [sku]: Math.max(0, Math.min(MAX_QTY, qty)),
    }));
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {tiers.map((tier) => (
          <TierCard
            key={tier.sku}
            tier={tier}
            qty={cart[tier.sku] ?? 0}
            setQty={(q) => setQty(tier.sku, q)}
            onOpen={() => setCeremonySku(tier.sku)}
            canOpen={ready && authenticated && tier.kind === "digital"}
          />
        ))}
      </div>

      <aside className="mt-4 lg:mt-0 lg:sticky lg:top-4">
        <CartPanel
          tiers={tiers}
          lines={lines}
          count={count}
          hasPhysical={hasPhysical}
          setQty={setQty}
          ready={ready}
          authenticated={authenticated}
          enabled={enabled}
          onSignIn={signInX}
        />
      </aside>

      {ceremonyTier && (
        <PackCeremony
          tier={ceremonyTier}
          open={ceremonySku !== null}
          onClose={() => setCeremonySku(null)}
        />
      )}
    </div>
  );
}

function QtyStepper({
  qty,
  setQty,
  label,
}: {
  qty: number;
  setQty: (q: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5" aria-label={label}>
      <Button
        variant="glass"
        size="sm"
        pad="none"
        aria-label={`Remove one ${label}`}
        disabled={qty <= 0}
        onClick={() => setQty(qty - 1)}
        className="w-9"
      >
        {/* No minus glyph in the flat set, so a bar carries the meaning. */}
        <span aria-hidden className="block h-0.5 w-3 rounded-[var(--radius-full)] bg-current" />
      </Button>
      <span className="tnum w-6 text-center text-sm font-semibold text-bone">
        {qty}
      </span>
      <Button
        variant="glass"
        size="sm"
        pad="none"
        aria-label={`Add one ${label}`}
        disabled={qty >= MAX_QTY}
        onClick={() => setQty(qty + 1)}
        className="w-9"
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function OddsTable({ tier }: { tier: ChestTier }) {
  const rows = [
    ["Rare", tier.odds.rare],
    ["Epic", tier.odds.epic],
    ["Legendary", tier.odds.legendary],
    ["Mythic", tier.odds.mythic],
  ] as const;
  return (
    <div className="rounded-lg border border-steel-line bg-obsidian/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        Odds per card
      </p>
      <dl className="mt-2 flex flex-col gap-1.5">
        {rows.map(([label, pct]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-bone-mut">{label}</dt>
            <dd className="tnum text-xs font-semibold text-bone">{pct}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TierCard({
  tier,
  qty,
  setQty,
  onOpen,
  canOpen,
}: {
  tier: ChestTier;
  qty: number;
  setQty: (q: number) => void;
  onOpen: () => void;
  canOpen: boolean;
}) {
  return (
    <Card
      variant={tier.kind === "physical" ? "warm" : "default"}
      radius="xl"
      className="flex flex-col gap-4"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-faint">
          {tier.kind === "physical" ? "Physical box" : "Digital chest"} &middot;{" "}
          {tier.plain}
        </p>
        <h2 className="gold-text mt-1 font-display text-xl font-semibold">
          {tier.name}
        </h2>
      </div>

      <ul className="flex flex-col gap-1.5">
        {tier.contents.map((line) => (
          <li
            key={line}
            className="flex items-start gap-2 text-sm text-bone-mut"
          >
            <Icon name="coin" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            {line}
          </li>
        ))}
      </ul>

      <OddsTable tier={tier} />

      <p className="flex items-start gap-2 text-xs leading-relaxed text-bone">
        <Icon name="medal" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        {tier.guarantee}
      </p>

      <div className="mt-auto flex flex-col gap-3 border-t border-steel-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-faint">
            Quantity
          </span>
          <QtyStepper qty={qty} setQty={setQty} label={tier.name} />
        </div>
        {canOpen && (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <Icon name="spark" className="h-4 w-4 text-gold" />
            Open a chest you own
          </Button>
        )}
      </div>
    </Card>
  );
}

interface ShippingAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
}

const EMPTY_ADDRESS: ShippingAddress = {
  name: "",
  line1: "",
  city: "",
  region: "",
  postal: "",
  country: "",
  line2: "",
};

function addressComplete(a: ShippingAddress): boolean {
  return Boolean(
    a.name && a.line1 && a.city && a.region && a.postal && a.country
  );
}

function CartPanel({
  tiers,
  lines,
  count,
  hasPhysical,
  setQty,
  ready,
  authenticated,
  enabled,
  onSignIn,
}: {
  tiers: ChestTier[];
  lines: CartLine[];
  count: number;
  hasPhysical: boolean;
  setQty: (sku: string, qty: number) => void;
  ready: boolean;
  authenticated: boolean;
  enabled: boolean;
  onSignIn: () => void;
}) {
  const tierBySku = useMemo(
    () => new Map(tiers.map((t) => [t.sku, t] as const)),
    [tiers]
  );
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Idempotency keys, one per distinct cart. A retry of the same cart reuses
     its key so the checkout route dedupes to a single order and a single
     charge; changing the cart mints a new key, and a new order. */
  const keyByCart = useRef<Map<string, string>>(new Map());
  function cartKey(): string {
    const serialized = lines
      .map((l) => `${l.sku}:${l.qty}`)
      .sort()
      .join("|");
    const existing = keyByCart.current.get(serialized);
    if (existing) return existing;
    const key = crypto.randomUUID();
    keyByCart.current.set(serialized, key);
    return key;
  }

  const needsAddress = hasPhysical;
  const addressOk = !needsAddress || addressComplete(address);

  async function checkout() {
    if (busy || count === 0) return;
    if (!authenticated) {
      onSignIn();
      return;
    }
    if (!addressOk) {
      setError("Add a shipping address for the physical box.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await realmFetch<CheckoutResponse>("/api/commerce/checkout", {
      method: "POST",
      json: {
        idempotencyKey: cartKey(),
        items: lines.map((l) => ({ kind: "chest", sku: l.sku, qty: l.qty })),
        /* Collected for physical fulfillment. The checkout route reads items
           and the idempotency key today; this rides alongside so the backend
           can persist it onto the fulfillments row without a contract change. */
        ...(needsAddress ? { shipping: address } : {}),
      },
    });
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    const map: Record<number, string> = {
      401: "Enter the realm to check out.",
      409: "Checkout is not open yet.",
      423: "The chests are sealed until launch.",
      429: "Too many attempts. Give it a moment.",
      503: "Checkout is resting. Try again shortly.",
    };
    setError(map[res.status] ?? res.data?.error ?? "Checkout could not start.");
    setBusy(false);
  }

  return (
    <Card variant="raised" radius="xl" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon name="wallet" className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Your cart
        </h2>
        {count > 0 && (
          <Badge variant="gold" className="ml-auto">
            {count}
          </Badge>
        )}
      </div>

      {count === 0 ? (
        <p className="text-sm text-bone-mut">
          Choose a chest to begin. Your exact total is confirmed at secure
          checkout.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => {
            const tier = tierBySku.get(l.sku);
            if (!tier) return null;
            return (
              <li
                key={l.sku}
                className="flex items-center justify-between gap-3 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-bone">
                    {tier.name}
                  </span>
                  <span className="text-[11px] text-bone-faint">
                    {tier.kind === "physical" ? "Physical box" : "Digital chest"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-sm text-bone-mut">
                  &times;{l.qty}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {needsAddress && (
        <fieldset className="flex flex-col gap-2.5 border-t border-steel-line pt-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-faint">
            Ship the box to
          </legend>
          <Field label="Full name">
            <Input
              value={address.name}
              onChange={(e) =>
                setAddress((a) => ({ ...a, name: e.target.value }))
              }
              autoComplete="name"
              className="h-9"
            />
          </Field>
          <Field label="Address">
            <Input
              value={address.line1}
              onChange={(e) =>
                setAddress((a) => ({ ...a, line1: e.target.value }))
              }
              autoComplete="address-line1"
              placeholder="Street and number"
              className="h-9"
            />
          </Field>
          <Input
            value={address.line2}
            onChange={(e) =>
              setAddress((a) => ({ ...a, line2: e.target.value }))
            }
            autoComplete="address-line2"
            placeholder="Apartment, suite (optional)"
            aria-label="Address line 2 (optional)"
            className="h-9"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="City">
              <Input
                value={address.city}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, city: e.target.value }))
                }
                autoComplete="address-level2"
                className="h-9"
              />
            </Field>
            <Field label="Region">
              <Input
                value={address.region}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, region: e.target.value }))
                }
                autoComplete="address-level1"
                className="h-9"
              />
            </Field>
            <Field label="Postal code">
              <Input
                value={address.postal}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, postal: e.target.value }))
                }
                autoComplete="postal-code"
                className="h-9"
              />
            </Field>
            <Field label="Country">
              <Input
                value={address.country}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, country: e.target.value }))
                }
                autoComplete="country-name"
                className="h-9"
              />
            </Field>
          </div>
        </fieldset>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-state-danger"
        >
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {!ready ? null : !authenticated ? (
        enabled ? (
          <Button variant="gold" size="lg" block onClick={onSignIn}>
            <Icon name="xlogo" className="h-4 w-4" />
            Enter to check out
          </Button>
        ) : (
          <p className="text-xs text-bone-faint">
            The Gatehouse is resting here.{" "}
            <Link href="/signin" className="text-gold underline">
              The gate
            </Link>{" "}
            opens once it is mounted.
          </p>
        )
      ) : (
        <Button
          variant="gold"
          size="lg"
          block
          loading={busy}
          disabled={count === 0}
          onClick={checkout}
        >
          {count === 0 ? "Cart is empty" : "Secure checkout"}
        </Button>
      )}

      <p className="text-[11px] leading-relaxed text-bone-faint">
        Your exact total, taxes and any shipping are shown on the secure
        checkout page before you pay. Chest openings settle on the server and
        every pull is auditable.
      </p>
    </Card>
  );
}
