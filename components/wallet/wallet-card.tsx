import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

/* Shared card shell for the wallet cards, matching the settings page chrome:
   glass surface, gold icon, display title, and a faint uppercase caption. */
export function WalletCard({
  icon,
  title,
  caption,
  children,
  warm = false,
}: {
  icon: string;
  title: string;
  caption?: string;
  children: ReactNode;
  warm?: boolean;
}) {
  return (
    <section className={`glass p-5 sm:p-6 ${warm ? "glass-warm" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          {title}
        </h2>
        {caption ? (
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            {caption}
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
