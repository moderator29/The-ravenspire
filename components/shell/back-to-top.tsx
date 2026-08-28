"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/* A quiet "back to the top" control that appears once the reader has scrolled
   a good way down a long feed, and glides the page back up on tap. Sits
   centered so it never fights the gold action button in the corner.

   Below the top bar, not on it. This feed renders under the mobile top bar
   (h-14, sticky), and at `top-3` the control materialised across the bar's
   centre, covering the brand mark it shares an axis with. The bar only exists
   under lg, so the offset follows it: clear of the bar on a phone, back to
   the page edge on a desktop that has no bar. z-nav rather than a raw number,
   because the control floats over content the way the dock does and must
   still pass under every real overlay. */
export function BackToTop({ threshold = 900 }: { threshold?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!show) return null;

  return (
    <Button
      variant="glass"
      size="sm"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed left-1/2 top-16 z-nav -translate-x-1/2 text-gold shadow-xl lg:top-3"
    >
      <Icon name="arrow" className="h-3.5 w-3.5 -rotate-90" />
      Back to top
    </Button>
  );
}
