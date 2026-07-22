import { Icon } from "@/components/ui/icon";

type Props = {
  themed: string;
  plain: string;
  icon: string;
  description: string;
  emptyNote?: string;
};

export function SectionPlaceholder({
  themed,
  plain,
  icon,
  description,
  emptyNote,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="flex items-center gap-3">
        <Icon name={icon} className="h-7 w-7 text-gold" />
        <h1 className="gold-text font-display text-2xl font-semibold tracking-wide sm:text-3xl">
          {themed}
        </h1>
      </div>
      <p className="mt-1 text-xs uppercase tracking-[0.28em] text-bone-faint">
        {plain}
      </p>
      <p className="mt-5 max-w-prose text-bone-mut">{description}</p>
      <div className="glass mt-8 p-6 text-center">
        <p className="text-sm text-bone-mut">
          {emptyNote ?? "The builders are at work on this hall."}
        </p>
      </div>
    </div>
  );
}
