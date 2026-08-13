"use client";

import { useEffect } from "react";
import { BANNER_STORAGE_KEY, readBanner } from "@/lib/share/links";

/*
  Capture a referral code from the landing URL (?banner=CODE, or the older
  ?ref=CODE) and remember it on this device under the same key the oath at
  /welcome reads. When the wanderer finishes onboarding, the banner that sent
  them is credited. Renders nothing.

  The parsing and the handle check moved to lib/share/links.ts in mission 10,
  where they are tested against the hostile cases. This value arrives in a URL a
  stranger was handed, is stowed in localStorage and is later posted to
  /api/onboard, and it was being validated by three separate copies of the same
  regex: here, in /welcome, and in the new share seam. Three copies of a
  validator is two copies too many for a value with that path.
*/
export function RefCapture() {
  useEffect(() => {
    try {
      const code = readBanner(window.location.search);
      if (code) localStorage.setItem(BANNER_STORAGE_KEY, code);
    } catch {
      /* no window or storage; nothing to capture */
    }
  }, []);

  return null;
}
