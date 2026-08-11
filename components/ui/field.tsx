"use client";

import type { ReactNode } from "react";
import { Field as BaseField } from "@base-ui/react/field";
import { Form as BaseForm } from "@base-ui/react/form";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Switch } from "@base-ui/react/switch";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";

/* Form controls on Base UI Field, Form and Select.

   The win here is accessibility we would otherwise have to hand wire on every
   input in the product: the label is associated with the control, the
   description is referenced by `aria-describedby`, the error is announced and
   linked by `aria-errormessage`, and `aria-invalid` tracks real validity
   rather than a boolean somebody remembered to set. None of that was true of
   the hand rolled fields this replaces.

   Controls are rounded rectangles at `--radius-md`, matching Button exactly,
   so a button and an input sitting side by side share a silhouette. */

const CONTROL =
  "w-full rounded-md border border-steel-line bg-obsidian/60 px-3 text-sm text-bone " +
  "placeholder:text-bone-faint " +
  "transition-[border-color,box-shadow,background-color] duration-fast ease-out-quint " +
  "hover:border-steel " +
  "data-focused:border-gold/60 data-focused:bg-obsidian/80 " +
  "data-invalid:border-state-danger/70 " +
  "data-disabled:cursor-not-allowed data-disabled:opacity-50";

const LABEL =
  "text-xs font-semibold uppercase tracking-[0.16em] text-bone-mut " +
  "data-disabled:opacity-50";

export interface FieldProps {
  label?: ReactNode;
  /* Helper text under the control. Always visible, unlike a tooltip, so it
     works for touch and screen reader users too. */
  description?: ReactNode;
  /* An externally supplied message, for server side validation. Native
     constraint errors render themselves without this. */
  error?: ReactNode;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  description,
  error,
  name,
  required,
  disabled,
  invalid,
  className,
  children,
}: FieldProps) {
  return (
    <BaseField.Root
      name={name}
      disabled={disabled}
      invalid={invalid || Boolean(error) || undefined}
      className={cx("flex flex-col gap-1.5", className)}
    >
      {label ? (
        <BaseField.Label className={LABEL}>
          {label}
          {required ? (
            <span aria-hidden className="ml-1 text-gold">
              *
            </span>
          ) : null}
        </BaseField.Label>
      ) : null}

      {children}

      {description ? (
        <BaseField.Description className="text-xs text-bone-faint">
          {description}
        </BaseField.Description>
      ) : null}

      {/* Base UI renders this only when the field is actually invalid, and
          wires it to the control, so it is announced rather than merely seen. */}
      <BaseField.Error className="text-xs text-state-danger">
        {error}
      </BaseField.Error>
    </BaseField.Root>
  );
}

/* Base UI types `className` as a string or a state callback. The callback form
   is not useful here, since the state variants are already expressed as
   `data-*` selectors in CONTROL, and narrowing it keeps `cx` simple. */
export type InputProps = Omit<
  React.ComponentProps<typeof BaseField.Control>,
  "className"
> & { className?: string };

export function Input({ className, ...props }: InputProps) {
  return <BaseField.Control className={cx(CONTROL, "h-9", className)} {...props} />;
}

export type TextareaProps = Omit<InputProps, "render">;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <BaseField.Control
      render={<textarea />}
      className={cx(CONTROL, "min-h-24 resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  items: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Select({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select",
  name,
  disabled,
  required,
  className,
}: SelectProps) {
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as string | null)}
      name={name}
      disabled={disabled}
      required={required}
    >
      <BaseSelect.Trigger
        className={cx(
          CONTROL,
          "flex h-9 items-center justify-between gap-2 text-left",
          "data-popup-open:border-gold/60",
          className
        )}
      >
        <BaseSelect.Value
          className="truncate data-placeholder:text-bone-faint"
          placeholder={placeholder}
        />
        <BaseSelect.Icon>
          <Icon name="chevron-updown" className="h-4 w-4 shrink-0 text-bone-faint" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-dropdown outline-none"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup
            className={cx(
              "max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto",
              "rounded-lg border border-gold/20 bg-panel/95 p-1 shadow-lifted backdrop-blur-[18px]",
              "origin-[var(--transform-origin)] transition-[transform,opacity] duration-fast ease-out-quint",
              "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
              "data-ending-style:scale-[0.98] data-ending-style:opacity-0"
            )}
          >
            <BaseSelect.List>
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  className={cx(
                    "flex cursor-default select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-bone-mut",
                    "data-highlighted:bg-panel data-highlighted:text-bone",
                    "data-selected:text-bone",
                    "data-disabled:opacity-50"
                  )}
                >
                  <BaseSelect.ItemIndicator className="shrink-0 text-gold">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="truncate">
                    {item.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

/* Base UI Form. Wrapping a group of Fields in this gives coordinated
   validation timing and lets the server return errors keyed by field name. */
export const Form = BaseForm;

/* Re-exported for the cases that need a part this file does not compose, for
   example a `<Field.Error match="valueMissing">` with bespoke copy. */
export const FieldParts = BaseField;

export type TogglePropsSize = "sm" | "md";

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /* Required. The switch is a control with no visible text of its own. */
  label: string;
  disabled?: boolean;
  size?: TogglePropsSize;
  className?: string;
}

/* The toggle, promoted out of components/settings and reshaped.

   It was a circle sliding inside a pill, which is the iOS switch and reads as
   borrowed. This is a rounded rectangle track with a rounded rectangle thumb,
   the founder's explicit call and the same silhouette as every other control
   in the system. Built on Base UI Switch, so it carries `role="switch"`,
   `aria-checked`, space and enter handling, and a hidden input that actually
   submits with a form, none of which the hand rolled version had. */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  disabled,
  size = "md",
  className,
}: ToggleProps) {
  const small = size === "sm";
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "relative shrink-0 rounded-sm border p-[2px]",
        "transition-[background-color,border-color] duration-fast ease-out-quint",
        "data-unchecked:border-steel-line data-unchecked:bg-steel-deep",
        "data-checked:border-gold/60 data-checked:bg-gold/20",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        small ? "h-5 w-9" : "h-6 w-11",
        className
      )}
    >
      {/* Track 44x24 with a 1px border and 2px of padding leaves an 18px
          square well, so the thumb is 18px and travels exactly 20px. The sm
          track is 36x20, a 14px thumb, 16px of travel. */}
      <Switch.Thumb
        className={cx(
          "block rounded-sm shadow-raised",
          "transition-transform duration-fast ease-out-quint",
          "data-unchecked:bg-bone-faint",
          "data-checked:bg-[image:linear-gradient(180deg,var(--gold-bright)_0%,var(--gold)_60%,var(--gold-deep)_100%)]",
          small
            ? "h-3.5 w-3.5 data-checked:translate-x-4"
            : "h-4.5 w-4.5 data-checked:translate-x-5"
        )}
      />
    </Switch.Root>
  );
}
