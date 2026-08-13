"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { realmFetch } from "@/lib/auth/api";
import { formatMoney, type Currency } from "@/lib/commerce/money";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/cx";

/* Order history in The Vault (V2 Part Two, section 38, slice 1).
 *
 * Reads GET /api/commerce/orders, the member's own orders under the service
 * role. Amounts are integer minor units the client formats; a past order's
 * total is a real recorded charge, so it is shown (this is not a provisional
 * price, which is the thing kept off client surfaces). An honest empty state
 * when there are no orders, never an invented row.
 *
 * After a checkout the provider returns the member to /vault?order=ID&status=
 * success. That order is highlighted and its status confirmed here.
 */

interface Order {
  id: string;
  status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  paid: "success",
  pending: "default",
  failed: "danger",
  cancelled: "default",
  refunded: "beta",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function OrderHistory() {
  const params = useSearchParams();
  const justOrdered = params.get("order");
  const justStatus = params.get("status");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const showSkeleton = useDelayedLoading(orders === null, 300);

  const load = useCallback(async () => {
    const res = await realmFetch<{ orders: Order[] }>("/api/commerce/orders");
    if (res.ok && res.data) setOrders(res.data.orders);
    else setOrders((prev) => prev ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* A just-returned checkout settles asynchronously through the webhook, so the
     order may still read pending for a beat. A couple of gentle refreshes catch
     the flip to paid without making the member reload. */
  useEffect(() => {
    if (!justOrdered) return;
    const timers = [1500, 4000, 8000].map((ms) =>
      window.setTimeout(() => void load(), ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [justOrdered, load]);

  return (
    <Card variant="raised" radius="xl" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="ledger" className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Orders
        </h2>
      </div>

      {justOrdered && justStatus === "success" && (
        <p className="flex items-center gap-2 rounded-md border border-gold/25 bg-gold/5 px-3 py-2 text-xs text-bone">
          <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-gold" />
          Payment received. Your order is being prepared.
        </p>
      )}

      {orders === null ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            <Skeleton radius="lg" className="h-14" />
            <Skeleton radius="lg" className="h-14" />
          </div>
        ) : null
      ) : orders.length === 0 ? (
        <EmptyState
          size="sm"
          icon="wallet"
          title="No orders yet"
          body="Chests and boxes you buy will appear here, with their status and total."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => {
            const highlight = o.id === justOrdered;
            const variant = STATUS_VARIANT[o.status] ?? "default";
            return (
              <li
                key={o.id}
                className={cx(
                  "flex items-center justify-between gap-3 rounded-md border bg-obsidian/40 px-3 py-2.5",
                  highlight ? "border-gold/40" : "border-steel-line"
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-bone">
                    {formatMoney({
                      minor: o.total_minor,
                      currency: (o.currency as Currency) ?? "usd",
                    })}
                  </span>
                  <span className="tnum text-[11px] text-bone-faint">
                    {formatDate(o.created_at)}
                  </span>
                </span>
                <Badge variant={variant}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
