"use client";

import { useEffect, useState } from "react";
import { Tour } from "@/components/onboarding/tour";

const KEY = "rvn_tour_done";

export function TourMount() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const wanted = window.location.search.includes("welcome=1");
      const done = localStorage.getItem(KEY);
      if (wanted && !done) setShow(true);
    } catch {
      // storage unavailable; skip the tour
    }
  }, []);

  if (!show) return null;

  return (
    <Tour
      onDone={() => {
        try {
          localStorage.setItem(KEY, "1");
        } catch {
          // ignore storage failures
        }
        setShow(false);
      }}
    />
  );
}
