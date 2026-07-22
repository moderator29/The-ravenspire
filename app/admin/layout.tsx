"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";

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

function SealedChamber() {
  return (
    <div className="realm-bg flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md p-8 text-center sm:p-10">
        <Icon name="lock" className="mx-auto h-8 w-8 text-bone-faint" />
        <h1 className="gold-text font-display mt-4 text-2xl font-semibold">
          The council chamber is sealed
        </h1>
        <p className="mt-3 text-sm text-bone-mut">
          Only sworn stewards of the realm may pass this door. If you hold a
          seat at the council table, sign in and present your seal.
        </p>
        <Link href="/signin" className="btn-gold mt-6 inline-flex px-5 py-2 text-sm">
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, enabled, authenticated } = useRealmAuth();
  const [gate, setGate] = useState<Gate>("checking");

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
    return (
      <div className="realm-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass w-full max-w-md p-8 text-center">
          <p className="text-sm text-bone-faint">
            Checking your seal at the chamber door.
          </p>
        </div>
      </div>
    );
  }

  if (gate === "sealed") return <SealedChamber />;

  return (
    <div className="realm-bg min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:flex-row lg:gap-6">
        {/* Sidebar on desktop, scroll row on small screens */}
        <aside className="shrink-0 lg:w-60">
          <div className="glass glass-sm p-3 lg:sticky lg:top-6 lg:p-4">
            <Link href="/admin" className="block px-2 py-1">
              <span className="gold-text font-display text-sm font-semibold tracking-[0.22em]">
                THE RAVENSPIRE ADMIN
              </span>
            </Link>
            <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {navItems.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-panel text-gold"
                        : "text-bone-mut hover:bg-panel hover:text-bone"
                    }`}
                  >
                    <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
