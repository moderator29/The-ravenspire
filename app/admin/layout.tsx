"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";

const navItems = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/users", label: "Users", icon: "user" },
  { href: "/admin/moderation", label: "Moderation", icon: "shield" },
  { href: "/admin/houses", label: "Houses", icon: "banner" },
  { href: "/admin/seasons", label: "Seasons", icon: "crown" },
  { href: "/admin/crests", label: "Crests", icon: "medal" },
  { href: "/admin/war", label: "The War", icon: "swords" },
  { href: "/admin/reports", label: "Reports", icon: "scroll" },
  { href: "/admin/flags", label: "Feature Flags", icon: "sliders" },
  { href: "/admin/settings", label: "Settings", icon: "wall" },
];

type Gate = "checking" | "sealed" | "open";

function SealedDoor() {
  return (
    <div className="realm-bg flex min-h-screen items-center justify-center px-4">
      <Card pad="lg" className="w-full max-w-md">
        <EmptyState
          icon="lock"
          title="The council chamber is sealed"
          body="Only sworn stewards of the realm may pass this door. If you hold a seat at the council table, sign in and present your seal."
          action={
            <Button variant="gold" size="lg" render={<Link href="/signin" />}>
              Sign in
            </Button>
          }
        />
      </Card>
    </div>
  );
}

/* Shaped like the chamber door it stands in for, and gated behind 300ms so a
   fast seal check never flashes a skeleton at the reader. */
function CheckingDoor() {
  return (
    <div className="realm-bg flex min-h-screen items-center justify-center px-4">
      <Card pad="lg" className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3">
          <Skeleton radius="lg" className="h-11 w-11" />
          <Skeleton radius="sm" className="h-4 w-3/5" />
          <Skeleton radius="sm" className="h-3 w-4/5" />
        </div>
      </Card>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, enabled, authenticated } = useRealmAuth();
  const [gate, setGate] = useState<Gate>("checking");
  const showChecking = useDelayedLoading(gate === "checking", 300);

  useEffect(() => {
    if (!ready) return;
    if (!enabled || !authenticated) {
      setGate("sealed");
      return;
    }
    let cancelled = false;
    void realmFetch<{ profile?: { is_admin?: boolean } }>("/api/me", {
      method: "POST",
    }).then((res) => {
      if (cancelled) return;
      setGate(res.ok && res.data?.profile?.is_admin ? "open" : "sealed");
    });
    return () => {
      cancelled = true;
    };
  }, [ready, enabled, authenticated]);

  if (gate === "checking") {
    return showChecking ? <CheckingDoor /> : null;
  }

  if (gate === "sealed") return <SealedDoor />;

  return (
    <div className="realm-bg min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:flex-row lg:gap-6">
        {/* Sidebar on desktop, scroll row on small screens. Section 10:
            different layouts, not one layout scaled. */}
        <aside className="shrink-0 lg:w-60">
          <Card pad="sm" className="lg:sticky lg:top-6">
            <Link href="/admin" className="block rounded-md px-2 py-1">
              <span className="gold-text font-display text-sm font-semibold tracking-[0.22em]">
                THE RAVENSPIRE ADMIN
              </span>
            </Link>
            <nav
              aria-label="Council sections"
              className="scrollbar-none mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {navItems.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm lg:min-h-9",
                      "transition-colors duration-fast ease-out-quint",
                      active
                        ? "bg-panel text-gold"
                        : "text-bone-mut hover:bg-panel hover:text-bone"
                    )}
                  >
                    <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </Card>
        </aside>

        <main className="min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
