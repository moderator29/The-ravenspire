"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className="btn-glass group px-3.5 py-1.5 text-xs font-semibold tracking-wide text-bone-mut hover:text-bone"
    >
      <Icon
        name="arrow"
        className="h-3.5 w-3.5 rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5"
      />
      {label}
    </button>
  );
}
