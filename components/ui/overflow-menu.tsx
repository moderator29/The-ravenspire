"use client";

/* Retired.

   This file used to hand roll a portalled overflow menu. It was a good faith
   effort and it still shipped four real defects: no focus management, a
   `role="menu"` with no keyboard contract behind it, no collision detection so
   it rendered off screen on the last post in the feed, and a close-on-scroll
   handler that dismissed it on the slightest thumb drift.

   The implementation now lives in components/ui/menu.tsx on Base UI Menu. This
   re-export exists only so the existing call sites keep working while they are
   migrated one at a time. Do not import from here in new code: use `Menu` with
   `MenuItem` children, which is the version that joins the arrow key contract. */

export { OverflowMenu } from "@/components/ui/menu";
