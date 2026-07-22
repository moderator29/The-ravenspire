"use client";

import { useEffect } from "react";

/*
  Capture a referral code from the landing URL (?ref=CODE, or the legacy
  ?banner=CODE) and remember it on this device under the same key the oath
  at /welcome reads. When the wanderer finishes onboarding, the banner that
  sent them is credited. Renders nothing.
*/
export function RefCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("ref") ?? params.get("banner");
      const code = raw?.toLowerCase().trim().replace(/^@/, "");
      /* Only keep values that look like a real handle/code. */
      if (code && /^[a-z0-9_]{3,20}$/.test(code)) {
        localStorage.setItem("rvn_banner", code);
      }
    } catch {
      /* no window or storage; nothing to capture */
    }
  }, []);

  return null;
}
