"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { formatMoney, type Currency } from "@/lib/commerce/money";
import { realmFetch } from "@/lib/auth/api";

/* A member's orders, in the Vault, because the Vault is where a member goes to
 * see what is theirs and what the realm owes them.
 *
 * Archetype: Console. Flat, dense, right-aligned figures on `tnum` so amounts
 * line up, no ornament. An order is a record, not a reward.
 *
 * REAL DATA ONLY, and here that means an empty list is the answer almost
 * everybody gets: nothing sells yet. The panel says so plainly rather than
 * rendering a specimen order, and it disappears entirely for a member who has
 * never bought anything, because an empty panel on a Console is noise.
 *
 * Amounts arrive as integer minor units and are formatted for display only.
 * `formatMoney` produces a string for a human and its output is never fed back
 * into arithmetic, which is the rule lib/commerce/money.ts exists to hold.
 */

type Order = {
  id: string;
  status: string;
  total_minor: number | null;
  currency: string | null;
  created_at: string;
  paid_at: string | null;
};

/* What each status means to a person, in the realm's own words. `pending` is
   the one worth naming carefully: it is not a failure, it is a checkout the
   member has not finished. */
const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  fulfilled: "Sent",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const showSkeleton = useDelayedLoading(orders === null, 300);

  const load = useCallback(async () => {
    const res = await realmFetch<{ orders?: Order[] }>("/api/commerce/orders");
    setOrders(res.data?.orders ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (orders === null) {
    return showSkeleton ? <Skeleton radius="xl" className="h-24 w-full" /> : null;
  }

  /* Nothing bought, nothing to show. A Console does not carry an empty panel
     explaining that it is empty. */
  if (orders.length === 0) return null;

  return (
    <Card>
      <SectionHeader title="Your orders" hint={`${orders.length}`} />
      <ul className="mt-2 flex flex-col divide-y divide-hair">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm text-bone">
                {STATUS_LABEL[order.status] ?? order.status}
              </span>
              <span className="tnum text-[11px] text-bone-faint">
                {new Date(order.paid_at ?? order.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {order.total_minor !== null ? (
                <span className="tnum text-sm font-semibold text-bone">
                  {formatMoney({
                    minor: order.total_minor,
                    currency: (order.currency as Currency) ?? "usd",
                  })}
                </span>
              ) : null}
              {order.status === "paid" || order.status === "fulfilled" ? (
                /* Gold for a settled order. Never green, in any success state
                   anywhere in this product. */
                <Badge variant="gold">Settled</Badge>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
