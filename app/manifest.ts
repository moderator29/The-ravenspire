import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Ravenspire",
    short_name: "The Ravenspire",
    description:
      "Make the call. Earn your name. A competitive realm of Houses, Calls, Crests and Renown, where standing is earned through participation.",
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
