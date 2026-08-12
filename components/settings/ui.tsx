"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card as UICard,
  CardBody,
  CardHeader,
  CardRow,
  SectionHeader as UISectionHeader,
} from "@/components/ui/card";
import { Toggle as UIToggle } from "@/components/ui/field";

/* Settings chrome, now a thin adapter over components/ui.

   This file was where the good version of Card, Row, Toggle and the section
   header lived, quarantined inside one feature folder while the rest of the
   product re-derived worse copies inline. Those four are now primitives, so
   what remains here is only the settings-specific signature, kept so the two
   call sites do not have to change in the same commit as the promotion.

   Prefer importing from @/components/ui directly in new work. */

/* A section header, optionally carrying one control on its own baseline.

   The Wallet section had its control, a link through to the full Vault, sitting
   in a row of its own between the header and the card: right aligned, underlined
   text, no target to speak of, and belonging visually to neither the heading
   above it nor the card below. A section's one control belongs on the section's
   own line, which is where a reader is already looking.

   The `action` slot lives in this wrapper rather than in the `SectionHeader`
   primitive because that primitive is being worked on elsewhere right now. It
   is a candidate to move up once that settles. */
export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  if (!action) return <UISectionHeader title={title} hint={hint} />;
  return (
    <div className="flex items-center justify-between gap-3">
      <UISectionHeader title={title} hint={hint} className="min-w-0 flex-1" />
      <div className="shrink-0 pt-2">{action}</div>
    </div>
  );
}

export function Card({
  icon,
  title,
  plain,
  warm,
  children,
}: {
  icon: string;
  title: string;
  plain?: string;
  warm?: boolean;
  children: ReactNode;
}) {
  return (
    <UICard
      render={<section />}
      variant={warm ? "warm" : "default"}
      pad="none"
    >
      <CardHeader icon={icon} title={title} hint={plain} />
      <CardBody className="pt-3">{children}</CardBody>
    </UICard>
  );
}

export function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <CardRow title={title} desc={desc}>
      {children}
    </CardRow>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <UIToggle
      checked={on}
      onCheckedChange={onChange}
      disabled={disabled}
      label={label}
    />
  );
}

/* Was a capsule, which the design rules forbid. Now the shared Badge, so a
   linked account status and a Beta marker are the same shape everywhere. */
export function StatusPill({
  tone,
  children,
}: {
  tone: "on" | "off";
  children: ReactNode;
}) {
  return (
    <Badge variant={tone === "on" ? "gold" : "default"}>{children}</Badge>
  );
}
