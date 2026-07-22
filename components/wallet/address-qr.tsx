"use client";

import { useMemo } from "react";
import encodeQR from "@paulmillr/qr";

/* Renders a scannable QR of the wallet's 0x address. The code is generated
   entirely on-device with @paulmillr/qr; nothing is sent anywhere. Falls back
   to nothing if the string cannot be encoded rather than showing a broken box. */
export function AddressQR({
  value,
  className = "h-44 w-44",
}: {
  value: string;
  className?: string;
}) {
  const svg = useMemo(() => {
    try {
      return encodeQR(value, "svg", { border: 2 });
    } catch {
      return null;
    }
  }, [value]);

  if (!svg) return null;

  return (
    <div
      className={`rounded-2xl bg-bone p-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.4)] [&>svg]:h-full [&>svg]:w-full ${className}`}
      aria-label="Wallet address QR code"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
