"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdaptiveDialog,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardRow,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  RARITIES,
  RarityChip,
  SectionHeader,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Tab,
  Tabs,
  TabsList,
  TabsPanel,
  Textarea,
  Toggle,
  Tooltip,
  TooltipProvider,
  ToastProvider,
  useToast,
  useAnnounce,
  useDelayedLoading,
  type BadgeVariant,
  type ButtonSize,
  type ButtonVariant,
  type CardVariant,
} from "@/components/ui";

/* INTERNAL DEV PAGE. Not linked from navigation, not part of the product.

   Every primitive in every variant and size on one screen, so the whole system
   can be eyeballed at once and a regression in one control is obvious next to
   the twelve that did not change. Nothing here reads or writes real data:
   there is no data on this page at all, only components. */

const BUTTON_VARIANTS: ButtonVariant[] = ["gold", "glass", "ghost", "danger"];
const BUTTON_SIZES: ButtonSize[] = ["sm", "md", "lg"];
const CARD_VARIANTS: CardVariant[] = ["default", "warm", "inset"];
const BADGE_VARIANTS: BadgeVariant[] = [
  "default",
  "gold",
  "beta",
  "danger",
  "success",
];

export default function KitchenSinkPage() {
  /* Dev only, enforced rather than assumed. "Not linked from navigation" is
     not the same as "not shipped": this page was reachable at its URL on the
     hosted realm, a whole showroom of controls wired to nothing, which is
     exactly what an investor poking at routes should never find. NODE_ENV is
     inlined at build time, so the production bundle compiles this branch to a
     straight 404 and the primitives below are tree shaken out with it. */
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <ToastProvider>
      <TooltipProvider>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-bone">
                Kitchen sink
              </h1>
              <Badge variant="beta">Internal</Badge>
            </div>
            <p className="max-w-[60ch] text-sm text-bone-mut">
              A development reference for components/ui. This page is not part
              of the product, is not linked from navigation, and renders no real
              data. If a control looks wrong here, it looks wrong everywhere.
            </p>
          </header>

          <ButtonsSection />
          <CardsSection />
          <TabsSection />
          <FieldsSection />
          <BadgesSection />
          <SkeletonSection />
          <EmptyStateSection />
          <OverlaysSection />
          <MenuTooltipToastSection />
        </div>
      </TooltipProvider>
    </ToastProvider>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={title} hint={hint} />
      {children}
    </section>
  );
}

function Swatch({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ButtonsSection() {
  return (
    <Section title="Button" hint="gold, glass, ghost, danger">
      <Card pad="lg" className="flex flex-col gap-5">
        {BUTTON_VARIANTS.map((variant) => (
          <Swatch key={variant} label={variant}>
            {BUTTON_SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size.toUpperCase()} action
              </Button>
            ))}
            <Button variant={variant} size="md" disabled>
              Disabled
            </Button>
            <Button variant={variant} size="md" loading>
              Working
            </Button>
          </Swatch>
        ))}

        <Swatch label="icon button">
          {BUTTON_SIZES.map((size) => (
            <IconButton
              key={size}
              icon="bell"
              label={`Notifications ${size}`}
              size={size}
            />
          ))}
          <IconButton icon="plus" label="Compose" variant="gold" />
          <IconButton icon="flag" label="Report" variant="danger" />
          <IconButton icon="user" label="Profile" shape="circle" />
        </Swatch>

        <Swatch label="composed with a link">
          <Button variant="gold" render={<Link href="/home" />}>
            Go to The Ravenry
          </Button>
          <IconButton
            icon="compass"
            label="The Crossroads"
            render={<Link href="/explore" />}
          />
        </Swatch>

        <Swatch label="block">
          <Button variant="gold" size="lg" block>
            Full width primary
          </Button>
        </Swatch>
      </Card>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section title="Card" hint="default, warm, inset">
      <div className="grid gap-4 sm:grid-cols-3">
        {CARD_VARIANTS.map((variant) => (
          <Card key={variant} variant={variant} pad="none">
            <CardHeader icon="scroll" title={variant} />
            <CardBody className="text-sm text-bone-mut">
              One chassis, many bodies. Only the interior varies.
            </CardBody>
            <CardFooter>
              <Button size="sm" variant="ghost">
                Dismiss
              </Button>
              <Button size="sm" variant="gold" className="ml-auto">
                Act
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Card variant="warm" pad="none">
        <CardHeader icon="sliders" title="Rows" hint="Dense" />
        <CardBody>
          <CardRow title="Interactive card" desc="Hover to see the lift">
            <Badge variant="gold">New</Badge>
          </CardRow>
          <CardRow title="A second row" desc="Separated by a hairline">
            <Button size="sm">Manage</Button>
          </CardRow>
        </CardBody>
      </Card>

      <Card interactive pad="lg" className="text-sm text-bone-mut">
        This card is interactive, so it lifts on hover. Static cards must not.
      </Card>
    </Section>
  );
}

function TabsSection() {
  const [segment, setSegment] = useState("earned");

  return (
    <Section title="Tabs" hint="underline and segmented">
      <Card pad="lg" className="flex flex-col gap-6">
        <Tabs defaultValue="signal">
          <TabsList>
            <Tab value="signal">Signal</Tab>
            <Tab value="latest">Latest</Tab>
            <Tab value="following">Following</Tab>
            <Tab value="houses">Houses</Tab>
            <Tab value="calls">Calls</Tab>
          </TabsList>
          <TabsPanel value="signal" className="pt-4 text-sm text-bone-mut">
            The underline slides between tabs with a layout animation.
          </TabsPanel>
          <TabsPanel value="latest" className="pt-4 text-sm text-bone-mut">
            Arrow keys move between tabs, and the panel follows.
          </TabsPanel>
          <TabsPanel value="following" className="pt-4 text-sm text-bone-mut">
            Every tab carries aria-selected, which the old buttons did not.
          </TabsPanel>
          <TabsPanel value="houses" className="pt-4 text-sm text-bone-mut">
            The strip scrolls horizontally without a visible scrollbar.
          </TabsPanel>
          <TabsPanel value="calls" className="pt-4 text-sm text-bone-mut">
            Home and End jump to the first and last tab.
          </TabsPanel>
        </Tabs>

        <Swatch label="segmented control">
          <SegmentedControl
            label="Crest filter"
            value={segment}
            onValueChange={setSegment}
            items={[
              { value: "earned", label: "Earned" },
              { value: "locked", label: "Locked" },
              { value: "all", label: "All" },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Range"
            items={[
              { value: "1d", label: "1D" },
              { value: "1w", label: "1W" },
              { value: "1m", label: "1M" },
            ]}
          />
        </Swatch>

        <SegmentedControl
          block
          label="Ledger view"
          items={[
            { value: "holdings", label: "Holdings" },
            { value: "history", label: "History" },
          ]}
        />
      </Card>
    </Section>
  );
}

function FieldsSection() {
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [house, setHouse] = useState<string | null>("ember");

  return (
    <Section title="Field" hint="input, textarea, select, toggle">
      <Card pad="lg" className="grid gap-5 sm:grid-cols-2">
        <Field label="Handle" description="How the realm addresses you" required>
          <Input placeholder="ravenwatch" />
        </Field>

        <Field label="Disabled" description="Nothing to change here">
          <Input placeholder="Locked" disabled />
        </Field>

        <Field
          label="Invalid"
          error="That handle is already taken."
          className="sm:col-span-1"
        >
          <Input defaultValue="raven" />
        </Field>

        <Field label="House" description="Where your loyalty sits">
          <Select
            value={house}
            onValueChange={setHouse}
            placeholder="Choose a House"
            items={[
              { value: "ember", label: "House Ember" },
              { value: "obsidian", label: "House Obsidian" },
              { value: "bone", label: "House Bone" },
            ]}
          />
        </Field>

        <Field
          label="Raven"
          description="Up to 280 characters"
          className="sm:col-span-2"
        >
          <Textarea placeholder="Send word to the realm" />
        </Field>

        <div className="sm:col-span-2">
          <CardRow title="Show my Ledger" desc="Public portfolio visibility">
            <Toggle
              checked={toggleA}
              onCheckedChange={setToggleA}
              label="Show my Ledger"
            />
          </CardRow>
          <CardRow title="Quiet hours" desc="Small toggle, same silhouette">
            <Toggle
              size="sm"
              checked={toggleB}
              onCheckedChange={setToggleB}
              label="Quiet hours"
            />
          </CardRow>
          <CardRow title="Disabled toggle" desc="Not yours to set">
            <Toggle
              checked={false}
              onCheckedChange={() => {}}
              label="Disabled toggle"
              disabled
            />
          </CardRow>
        </div>
      </Card>
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section title="Badge" hint="status and rarity">
      <Card pad="lg" className="flex flex-col gap-5">
        <Swatch label="variants">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
          <Badge variant="gold" icon="crown">
            With icon
          </Badge>
        </Swatch>

        <Swatch label="rarity ladder">
          {RARITIES.map((rarity) => (
            <RarityChip key={rarity} rarity={rarity} />
          ))}
        </Swatch>
      </Card>
    </Section>
  );
}

function SkeletonSection() {
  const [loading, setLoading] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  return (
    <Section title="Skeleton" hint="content shaped, gated at 300ms">
      <Card pad="lg" className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <Skeleton radius="full" className="h-10 w-10 shrink-0" />
          <div className="flex-1">
            <Skeleton radius="sm" className="h-3 w-32" />
            <SkeletonText lines={3} className="mt-3" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setLoading((v) => !v)}>
            {loading ? "Stop loading" : "Start loading"}
          </Button>
          <span className="text-xs text-bone-faint">
            {showSkeleton
              ? "Past the gate, so the skeleton is showing."
              : loading
                ? "Loading, but under 300ms so nothing is shown yet."
                : "Idle."}
          </span>
        </div>

        {showSkeleton ? <Skeleton radius="xl" className="h-24 w-full" /> : null}
      </Card>
    </Section>
  );
}

function EmptyStateSection() {
  return (
    <Section title="Empty state" hint="honest, with a way forward">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card pad="none">
          <EmptyState
            icon="raven"
            title="No ravens yet"
            body="The ravens carry no word. Send the first raven of the realm."
            action={
              <Button size="sm" variant="gold">
                Send a raven
              </Button>
            }
          />
        </Card>
        <Card pad="none">
          <EmptyState
            size="sm"
            icon="coin"
            title="No holdings"
            body="Your Ledger is empty."
          />
        </Card>
        <div className="sm:col-span-2">
          <EmptyState
            bordered
            icon="search"
            title="Nothing matched"
            body="No member, coin or House answers to that name."
          />
        </div>
      </div>
    </Section>
  );
}

function OverlaysSection() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [adaptive, setAdaptive] = useState(false);

  return (
    <Section title="Overlays" hint="modal, confirm, sheet">
      <Card pad="lg">
        <Swatch label="triggers">
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Destructive confirm
          </Button>
          <Button onClick={() => setSheet(true)}>Open bottom sheet</Button>
          <Button variant="gold" onClick={() => setAdaptive(true)}>
            Adaptive (sheet under 768px)
          </Button>
        </Swatch>

        <Modal
          open={modal}
          onOpenChange={setModal}
          title="A modal"
          description="Portalled to the body, focus trapped, scroll locked."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setModal(false)}>
                Cancel
              </Button>
              <Button variant="gold" size="sm" onClick={() => setModal(false)}>
                Confirm
              </Button>
            </>
          }
        >
          <p className="text-sm text-bone-mut">
            Escape closes it, an outside press closes it, and focus returns to
            the trigger when it goes.
          </p>
        </Modal>

        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          tone="danger"
          title="Delete this raven?"
          description="This cannot be undone, and the raven leaves every feed it landed in."
          confirmLabel="Delete"
          onConfirm={() => setConfirm(false)}
        />

        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title="A bottom sheet"
          description="Drag it down to dismiss."
          footer={
            <Button variant="gold" size="sm" onClick={() => setSheet(false)}>
              Done
            </Button>
          }
        >
          <p className="text-sm text-bone-mut">
            The mobile default for anything that would otherwise be a modal.
          </p>
        </Sheet>

        <AdaptiveDialog
          open={adaptive}
          onOpenChange={setAdaptive}
          title="Adaptive"
          description="A sheet on a phone, a modal on a desktop."
        >
          <p className="text-sm text-bone-mut">
            Resize the window across 768px and open it again.
          </p>
        </AdaptiveDialog>
      </Card>
    </Section>
  );
}

function MenuTooltipToastSection() {
  const toast = useToast();
  const announce = useAnnounce();

  return (
    <Section title="Menu, tooltip, toast" hint="popups and announcements">
      <Card pad="lg" className="flex flex-col gap-5">
        <Swatch label="menu">
          <Menu trigger={<IconButton icon="dots" label="More" />}>
            <MenuItem icon="share">Copy link</MenuItem>
            <MenuItem icon="bell">Mute</MenuItem>
            <MenuSeparator />
            <MenuItem icon="flag" tone="danger">
              Report
            </MenuItem>
          </Menu>
          <Menu
            align="start"
            trigger={<Button size="sm">Menu with a button trigger</Button>}
          >
            <MenuItem icon="user">View profile</MenuItem>
            <MenuItem icon="shield" disabled>
              Disabled item
            </MenuItem>
          </Menu>
        </Swatch>

        <Swatch label="tooltip">
          <Tooltip content="Send a raven">
            <IconButton icon="send" label="Send" />
          </Tooltip>
          <Tooltip content="Bookmark this" side="right">
            <IconButton icon="bookmark" label="Bookmark" />
          </Tooltip>
        </Swatch>

        <Swatch label="toast">
          <Button size="sm" onClick={() => toast.show({ title: "Plain toast" })}>
            Default
          </Button>
          <Button
            size="sm"
            variant="gold"
            onClick={() =>
              toast.success({
                title: "Tribute sent",
                description: "The coin moved wallet to wallet.",
              })
            }
          >
            Success
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              toast.error({
                title: "That did not send",
                description: "The chain rejected the transaction.",
              })
            }
          >
            Error
          </Button>
          <Button
            size="sm"
            onClick={() => toast.info({ title: "The Rookery is live" })}
          >
            Info
          </Button>
        </Swatch>

        <Swatch label="live region">
          <Button
            size="sm"
            onClick={() => announce("Twelve new ravens have arrived")}
          >
            Announce politely
          </Button>
          <span className="text-xs text-bone-faint">
            Silent on screen, spoken by a screen reader.
          </span>
        </Swatch>
      </Card>
    </Section>
  );
}
