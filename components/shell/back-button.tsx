"use client";

import { useRouter } from "next/navigation";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { canRetrace } from "@/components/shell/nav-depth";

type BackButtonProps = {
  /** Where to go when there is no history to step back into. */
  href?: string;
  /** The word beside the arrow. Kept short and quiet by design. */
  label?: string;
  /** Drop the word and render a circular icon button.

      For a full bleed surface, where the back control sits in a fixed header
      beside a title rather than above page content. Rule 9 allows a circle for
      a genuinely circular icon button, and this is one: no label, not part of
      a row. The label is still passed to the accessible name. */
  circle?: boolean;
};

/*
  A single, consistent way back. When the member arrived through the realm we
  simply retrace their last step; when they landed here cold (a shared link, a
  fresh tab) there is nothing behind them, so we send them somewhere sensible
  instead of out of the realm or into a trap. Whether a step exists to retrace
  is answered at press time by canRetrace (Navigation API where the browser
  has it, the per-tab depth counter where it does not): asked on click rather
  than cached at mount, because the answer can change while the page is open.
  Styled as a small glass control to sit calmly above page content.
*/
export function BackButton({
  href = "/home",
  label = "Back",
  circle = false,
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (canRetrace()) router.back();
    else router.push(href);
  };

  if (circle) {
    return (
      <IconButton
        icon="arrow"
        label={label}
        variant="glass"
        shape="circle"
        size="lg"
        onClick={handleClick}
        className="[&_svg]:rotate-180"
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      pad="none"
      onClick={handleClick}
      aria-label={label}
      /* `self-start` is load bearing across roughly twenty five call sites.
         Both this control and the `.btn-glass` it replaced are inline-flex,
         and a flex item in a column container stretches on the cross axis by
         default, so a bare BackButton dropped into any `flex-col` spans the
         full width and stops reading as a back control. Pinning it here means
         no caller has to remember. */
      /* A back control is a way out, not a call to action, and it was drawn as
         a full glass plate: a bordered box roughly 78 by 44 sitting above the
         page title and reading heavier than anything it led back to. It is a
         word and an arrow now, with no plate and no border, so it takes only
         the room the words need.

         The 44px floor is untouched. Losing the plate loses the border and the
         background, not the target: the control is still a full height button,
         it simply has nothing drawn around it, which is the whole point. */
      className="group -ml-1 self-start px-1 tracking-wide text-bone-mut hover:text-bone"
    >
      <Icon
        name="arrow"
        className="h-3.5 w-3.5 rotate-180 transition-transform duration-fast group-hover:-translate-x-0.5"
      />
      {label}
    </Button>
  );
}
