"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type BackButtonProps = {
  /** Where to go when there is no history to step back into. */
  href?: string;
  /** The word beside the arrow. Kept short and quiet by design. */
  label?: string;
};

/*
  A single, consistent way back. When the member arrived through the realm we
  simply retrace their last step; when they landed here cold (a shared link, a
  fresh tab) there is nothing behind them, so we send them somewhere sensible
  instead of trapping them. Styled as a small glass control to sit calmly above
  page content.
*/
export function BackButton({ href = "/home", label = "Back" }: BackButtonProps) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    /* history.length > 1 means there is a step to retrace within this tab. */
    setCanGoBack(window.history.length > 1);
  }, []);

  const handleClick = () => {
    if (canGoBack) router.back();
    else router.push(href);
  };

  return (
    <Button
      variant="glass"
      size="sm"
      onClick={handleClick}
      aria-label={label}
      /* `self-start` is load bearing across roughly twenty five call sites.
         Both this control and the `.btn-glass` it replaced are inline-flex,
         and a flex item in a column container stretches on the cross axis by
         default, so a bare BackButton dropped into any `flex-col` spans the
         full width and stops reading as a back control. Pinning it here means
         no caller has to remember. */
      className="group self-start tracking-wide text-bone-mut hover:text-bone"
    >
      <Icon
        name="arrow"
        className="h-3.5 w-3.5 rotate-180 transition-transform duration-fast group-hover:-translate-x-0.5"
      />
      {label}
    </Button>
  );
}
