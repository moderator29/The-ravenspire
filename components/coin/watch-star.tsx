"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { isWatched, toggleWatch, subscribe } from "./watchlist";

interface Props {
  /** The address (preferred) or symbol that identifies this coin. */
  id: string;
  /** Ticker, used only for the accessible label. */
  symbol?: string;
  className?: string;
}

/*
  A star for the local watchlist. Reads the shared store through
  useSyncExternalStore so every star for the same coin stays in lockstep. The
  bookmark glyph is drawn in living gold when kept, quiet bone when not, since
  the shared Icon set strokes rather than fills.
*/
export function WatchStar({ id, symbol, className = "" }: Props) {
  const watched = useSyncExternalStore(
    subscribe,
    () => isWatched(id),
    () => false
  );

  const label = watched
    ? `Remove ${symbol ?? "coin"} from watchlist`
    : `Add ${symbol ?? "coin"} to watchlist`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatch(id);
      }}
      aria-pressed={watched}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors ${
        watched
          ? "text-gold hover:text-gold-bright"
          : "text-bone-faint hover:text-bone-mut"
      } ${className}`}
    >
      <Icon name="bookmark" className="h-4 w-4" />
    </button>
  );
}
