import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Ravenspire",
    short_name: "The Ravenspire",
    description:
      "See every chain. Fear no rug. Rule your realm. A fun-first social realm of Houses, Calls, crests and The War.",
    start_url: "/",
    display: "standalone",
    background_color: "#07070A",
    theme_color: "#07070A",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
