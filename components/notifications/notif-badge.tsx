"use client";

import { useNotifications } from "@/components/notifications/notifications-provider";

/* The unread count as a gold pill. Renders nothing when the member is caught
   up, so quiet states stay quiet. Caps the label at 99+ so the pill never
   grows unbounded. */
export function NotifBadge({ className = "" }: { className?: string }) {
  const { unread } = useNotifications();
  if (unread <= 0) return null;
  const label = unread > 99 ? "99+" : String(unread);
  return (
    <span
      className={`tnum inline-flex min-w-[18px] items-center justify-center rounded-full border border-gold/50 bg-gold/20 px-1.5 text-[10px] font-bold leading-[18px] text-gold-bright ${className}`}
    >
      {label}
    </span>
  );
}

/* A bare gold dot for compact chrome (the mobile bell), shown only when there
   are unread ravens. */
export function NotifDot({ className = "" }: { className?: string }) {
  const { unread } = useNotifications();
  if (unread <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 rounded-full bg-gold-bright shadow-[0_0_6px_rgba(240,214,140,0.7)] ${className}`}
    />
  );
}
