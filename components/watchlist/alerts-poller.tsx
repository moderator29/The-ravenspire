"use client";

import { useEffect, useRef } from "react";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/*
  Session-driven price-alert evaluation. Renders nothing; it is the always
  mounted counterpart to ToastProvider / NotificationsProvider / DossierProvider
  in app/(shell)/layout.tsx, one more provider in the same style rather than a
  visible surface.

  WHY A POLLER AND NOT A CRON: see the full reasoning on
  app/api/watchlist/alerts/check/route.ts's own header comment. Short version:
  every scheduled job in this repo runs once a day, the finest grain Vercel's
  free tier allows, and a paid tier to get minute level cron is exactly what
  house rule 19 (no new paid service, assume the budget is zero) rules out. So
  alert evaluation runs instead whenever a member has the shell open, on the
  interval below, which fires within a few minutes of the member being in the
  app rather than the moment a real-time push would.

  INTERVAL, 2.5 minutes: fast enough that "a few minutes after you open the
  app" is true, and comfortably under the check route's own 60/hour ceiling
  even with more than one tab open (one tab at this cadence makes about 24
  calls an hour). The route itself answers cheaply, one indexed `select` on
  the member's own rows, when nothing is armed, so this is not tuned any
  tighter than that: a member who never arms an alert pays for one small read
  every 2.5 minutes while the app is open, nothing more.

  GATING: authenticated only. The route's own query already narrows to "does
  this member have any alert armed", so this component does not first ask
  whether anything is armed before deciding whether to poll, a second request
  spent trying to save the first one. Simpler and just as honest. */

const CHECK_INTERVAL_MS = 150_000; // 2.5 minutes

export function AlertsPoller() {
  const { ready, authenticated } = useRealmAuth();
  /* Guards against a slow response still in flight when the interval ticks
     again, never a slow member's second click against a fast one. */
  const inFlight = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated) return;

    const check = () => {
      if (inFlight.current) return;
      inFlight.current = true;
      void realmFetch("/api/watchlist/alerts/check").finally(() => {
        inFlight.current = false;
      });
    };

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [ready, authenticated]);

  return null;
}
