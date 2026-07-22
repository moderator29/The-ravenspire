"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { bottomNav } from "@/lib/nav";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-steel-line/70 bg-obsidian/92 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {bottomNav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-16 flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
                active ? "text-gold-bright" : "text-bone-faint"
              }`}
            >
              <Icon name={item.icon} className="h-[21px] w-[21px]" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
