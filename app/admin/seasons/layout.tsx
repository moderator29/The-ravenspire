import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "THE RAVENSPIRE Admin: Seasons",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
