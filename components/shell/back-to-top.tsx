"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

/* A quiet "back to the top" pill that fades in once the reader has scrolled a
   good way down a long feed, and glides the page back up on tap. Sits centered
   at the top so it never fights the gold action button in the corner. */
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
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="btn-glass fixed left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-gold shadow-xl backdrop-blur-xl transition active:scale-95"
    >
      <Icon name="arrow" className="h-3.5 w-3.5 -rotate-90" />
      Back to top
    </button>
  );
}
