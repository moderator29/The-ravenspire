/* The primitive layer.

   Twelve files on @base-ui/react plus the icon set, covering the controls the
   product was re-deriving inline over a hundred times. Prefer these over raw
   Tailwind; if a primitive is missing, add it here rather than rebuilding it
   in a feature folder.

   Import from the barrel for anything composed of several primitives, or
   directly from the file for a single one. */

export { cx } from "@/components/ui/cx";
export type { ClassValue } from "@/components/ui/cx";

export { Icon } from "@/components/ui/icon";

export { Button, IconButton } from "@/components/ui/button";
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  IconButtonProps,
} from "@/components/ui/button";

export {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardRow,
  SectionHeader,
} from "@/components/ui/card";
export type { CardPad, CardProps, CardVariant } from "@/components/ui/card";

export { ConfirmDialog, Modal, ModalClose } from "@/components/ui/modal";
export type {
  ConfirmDialogProps,
  ModalProps,
  ModalSize,
} from "@/components/ui/modal";

export {
  AdaptiveDialog,
  Sheet,
  SheetClose,
  useIsMobile,
} from "@/components/ui/sheet";
export type {
  AdaptiveDialogProps,
  SheetProps,
  SheetSide,
} from "@/components/ui/sheet";

export {
  Field,
  FieldParts,
  Form,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/field";
export type {
  FieldProps,
  InputProps,
  SelectOption,
  SelectProps,
  TextareaProps,
  ToggleProps,
} from "@/components/ui/field";

export {
  SegmentedControl,
  Tab,
  Tabs,
  TabsList,
  TabsPanel,
} from "@/components/ui/tabs";
export type {
  SegmentedControlItem,
  SegmentedControlProps,
  TabsProps,
} from "@/components/ui/tabs";

export { Slider } from "@/components/ui/slider";
export type { SliderProps } from "@/components/ui/slider";

export { Badge, RARITIES, RarityChip } from "@/components/ui/badge";
export type { BadgeProps, BadgeVariant, Rarity } from "@/components/ui/badge";

export {
  Skeleton,
  SkeletonText,
  useDelayedLoading,
} from "@/components/ui/skeleton";
export type { SkeletonRadius } from "@/components/ui/skeleton";

export { EmptyState } from "@/components/ui/empty-state";
export type {
  EmptyStateProps,
  EmptyStateSize,
} from "@/components/ui/empty-state";

export { ToastProvider, useAnnounce, useToast } from "@/components/ui/toast";
export type { ToastOptions, ToastTone } from "@/components/ui/toast";

export {
  Menu,
  MenuGroup,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  OverflowMenu,
} from "@/components/ui/menu";
export type { MenuItemProps, MenuProps } from "@/components/ui/menu";

export { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
export type { TooltipProps } from "@/components/ui/tooltip";
