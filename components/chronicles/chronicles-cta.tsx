"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The same authenticated/signed-out branch the landing page's own hero CTA
   uses, kept in one small client island so the Chronicles header itself can
   stay a server component. */
export function ChroniclesCta({ className }: { className?: string }) {
  const { authenticated } = useRealmAuth();
  const href = authenticated ? "/home" : "/signin";
  const label = authenticated ? "Enter the Ravenry" : "Enter the Realm";
  return (
    <Button variant="gold" size="sm" render={<Link href={href} />} className={className}>
      {label}
    </Button>
  );
}
