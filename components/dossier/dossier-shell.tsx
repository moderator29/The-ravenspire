"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tab, Tabs, TabsList, TabsPanel } from "@/components/ui/tabs";
import { BackButton } from "@/components/shell/back-button";

/* The Dossier archetype, expressed once.

   A subject with a hero, tabs and panels. The archetype for anything that has
   an identity: a Keep, a public profile, a House hall, a Coin, a Champion, a
   post and a Call.

   Stream, Board and Console each had exactly one shell. Dossier had none, and
   it is the archetype with the most routes under it, so every one of them was
   re-deriving the same four decisions and getting a different answer:

     the column width                   max-w-2xl here, max-w-3xl there
     where the back control sits        above the hero, inside it, or absent
     which tab pattern a section uses   underline in one hall, a segmented
                                        control in the next
     what a panel looks like            a Card with a hand written header row

   Section 2 fixes the order and it is not negotiable: hero band, then tabs,
   then panels, always. Section 3 fixes the tab pattern: sections of one
   subject are underline tabs, never a segmented control, because a segmented
   control says "two views of the same data" and a Dossier section is a
   different view of a different thing. Section 4 gives Dossier comfortable
   density at every breakpoint, so nothing here compacts at `md`.

   Ornament budget, from section 2: the hero only. A hero may carry the Forge
   register, a House sigil in 3D or a Renown crest. Every panel below it is
   Ledger, flat and quiet. */

/* Panels go two column at `lg` and one below, so a Dossier whose panels are a
   grid needs the room for it. A Dossier whose panel is a column of ravens does
   not: the Stream law caps a reading column at 640px whatever surrounds it. */
type DossierWidth = "subject" | "wide";

const WIDTH: Record<DossierWidth, string> = {
  subject: "max-w-2xl",
  wide: "max-w-2xl lg:max-w-4xl",
};

export function DossierPage({
  width = "subject",
  className,
  children,
}: {
  width?: DossierWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        /* One step tighter, the same step the card chassis took in c23139a. A
           Dossier is comfortable density, which governs what is inside a
           panel, not how much air the page wraps around it: 24px of top and
           bottom gutter on a desktop Keep was pushing the hero down for
           nothing. */
        "mx-auto w-full px-3 py-3 sm:px-4 sm:py-4",
        WIDTH[width],
        className
      )}
    >
      {children}
    </div>
  );
}

/* House rule 16: every page that can be navigated into needs a back control.
   A Dossier is always navigated into, never landed on from the dock, so this
   is not optional and the shell holds it rather than each route remembering. */
export function DossierHeader({
  backHref,
  backLabel,
  actions,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-center gap-3", className)}>
      <BackButton
        {...(backHref ? { href: backHref } : {})}
        {...(backLabel ? { label: backLabel } : {})}
      />
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* The hero band. The one place in a Dossier where ornament is allowed, and
   the reason it is a named slot rather than a div is that the rule is about
   position: everything after this is Ledger. */
export function DossierHero({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <header className={className}>{children}</header>;
}

/* The banner variant of a hero: an image or a house tinted wash, with the
   subject's identity pulled up over its lower edge. */
export function DossierBanner({
  style,
  className,
  children,
}: {
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card
      pad="none"
      className={cx("relative h-32 overflow-hidden sm:h-40", className)}
      style={style}
    >
      {children}
    </Card>
  );
}

/* Sits after the banner in the DOM and paints above it, so the overlap needs
   no rung off the z-index scale. */
export function DossierIdentity({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("relative -mt-8 px-4", className)}>{children}</div>
  );
}

export interface DossierTab {
  value: string;
  label: ReactNode;
  /* Shown quietly beside the label. Section 3: a Dossier's tabs usually carry
     counts, and a count of zero is honest, so pass the real number rather than
     hiding the tab. */
  count?: number;
}

/* The underline strip. Three to six sections of one subject, each a genuinely
   different view, with the gold rule sliding between them. */
export function DossierTabs({
  tabs,
  value,
  onValueChange,
  trailing,
  className,
  children,
}: {
  tabs: DossierTab[];
  value: string;
  onValueChange: (value: string) => void;
  /* Plain links that live on the tab line without being tabs: same type, same
     height, no underline because they navigate away rather than switch a
     panel. The Keep's Renown and Saved entries, which the dock strip used to
     carry as boxed chips, sit here as text. Rendered beside the tablist
     rather than inside it, so the list's tab semantics stay pure; the wrapper
     carries its own bottom hairline so the rule runs unbroken across both. */
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const list = (
    <TabsList className={trailing ? "min-w-0 flex-1" : undefined}>
      {tabs.map((t) => (
        <Tab key={t.value} value={t.value}>
          {t.label}
          {typeof t.count === "number" ? (
            <span className="tnum ml-1.5 text-bone-faint">{t.count}</span>
          ) : null}
        </Tab>
      ))}
    </TabsList>
  );

  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      className={cx("mt-4", className)}
    >
      {trailing ? (
        <div className="flex items-stretch">
          {list}
          <div className="flex shrink-0 items-center gap-1 border-b border-steel-line pl-1">
            {trailing}
          </div>
        </div>
      ) : (
        list
      )}
      {children}
    </Tabs>
  );
}

export function DossierTabPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsPanel value={value} className={cx("mt-3", className)}>
      {children}
    </TabsPanel>
  );
}

/* Two columns at `lg`, one below. The grid is here rather than in each route
   because getting it wrong is invisible until a Dossier has three panels. */
export function DossierPanels({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("grid gap-3 lg:grid-cols-2", className)}>{children}</div>
  );
}

/* One panel. Ledger register, no exceptions: a flat card, a hairline, a title
   that does not shout. */
export function DossierPanel({
  title,
  icon,
  hint,
  action,
  /* Spans both columns at `lg`. For the one panel on a Dossier that is a
     stream, a chart or a table rather than a list of facts. */
  wide,
  className,
  children,
}: {
  title?: ReactNode;
  icon?: string;
  hint?: ReactNode;
  action?: ReactNode;
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    /* `pad="none"` plus hand written gutters, because the header and the body
       need a hairline between them and one padded box cannot draw that. The
       numbers are the card chassis's own `md` rung after c23139a tightened it
       (14 base, 16 at `sm`); before this they were still the pre-c23139a 16/20,
       so a Dossier panel was the one card in the product that had not moved and
       it sat visibly looser than every card beside it. */
    <Card pad="none" className={cx(wide && "lg:col-span-2", className)}>
      {title ? (
        <div className="flex items-center gap-2 border-b border-steel-line px-3.5 py-2.5 sm:px-4">
          {icon ? (
            <Icon name={icon} className="h-4 w-4 shrink-0 text-gold" />
          ) : null}
          <h2 className="font-display text-base font-semibold text-bone">
            {title}
          </h2>
          {hint ? (
            <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
              {hint}
            </span>
          ) : null}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="px-3.5 py-3.5 sm:px-4 sm:py-4">{children}</div>
    </Card>
  );
}

/* A section rule inside a Dossier panel stack, for a Dossier with no tabs.
   The thread divider on a post detail is the reason it exists. */
export function DossierDivider({
  icon,
  children,
}: {
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 flex items-center gap-3 px-1">
      <span className="h-px flex-1 bg-[image:linear-gradient(90deg,transparent,color-mix(in_srgb,var(--gold)_25%,transparent))]" />
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
        {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
        {children}
      </span>
      <span className="h-px flex-1 bg-[image:linear-gradient(270deg,transparent,color-mix(in_srgb,var(--gold)_25%,transparent))]" />
    </div>
  );
}

/* Shaped like the Dossier it stands in for: a hero band, an identity block,
   a tab rule, then panels. Not four generic grey boxes. */
export function DossierSkeleton({
  width = "subject",
  panels = 2,
  /* A Dossier about a member overlaps a round portrait on the banner. A
     Dossier about a House or a coin does not, and drawing a circle that never
     arrives is worse than drawing nothing. */
  portrait = true,
}: {
  width?: DossierWidth;
  panels?: number;
  portrait?: boolean;
}) {
  return (
    <DossierPage width={width}>
      <Skeleton radius="sm" className="h-8 w-20" />
      <Skeleton radius="xl" className="mt-3 h-32 w-full sm:h-40" />
      <div className={cx("px-4", portrait ? "relative -mt-8" : "mt-4")}>
        {portrait ? (
          <Skeleton radius="full" className="h-[76px] w-[76px]" />
        ) : null}
        <Skeleton radius="sm" className={cx("h-5 w-44", portrait && "mt-3")} />
        <Skeleton radius="sm" className="mt-2 h-3 w-28" />
        <Skeleton radius="sm" className="mt-3 h-3 w-full max-w-sm" />
      </div>
      {/* Tracks DossierTabs and DossierTabPanel above. A skeleton whose rhythm
          does not match what arrives makes the page jump on load, which is the
          one thing a skeleton exists to prevent. */}
      <Skeleton radius="sm" className="mt-4 h-9 w-full" />
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: panels }, (_, i) => (
          <Skeleton key={i} radius="xl" className="h-32 w-full" />
        ))}
      </div>
    </DossierPage>
  );
}

/* The honest absence. A Dossier is addressed by name, so the name being wrong
   is a normal outcome and it gets a real page rather than a bare sentence. */
export function DossierMissing({
  title,
  body,
  backHref,
  action,
}: {
  title: ReactNode;
  body: ReactNode;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      {/* The message is centred because an honest absence reads as a notice
          rather than as a page of content. The back control is not part of that
          notice: it is the same navigation chrome every other Dossier carries,
          and every one of them puts it top left. Centred, it read as the
          missing page's primary action, which is what `action` below is for.
          The text-center wrapper moved off this box and onto the copy so the
          control can sit where the eye already looks for it. */}
      <div className="mb-6 flex">
        <BackButton {...(backHref ? { href: backHref } : {})} />
      </div>
      <div className="text-center">
        <h1 className="font-display text-xl font-semibold text-bone">
          {title}
        </h1>
        <p className="mt-2 text-sm text-bone-mut">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}
