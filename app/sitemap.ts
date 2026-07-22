import type { MetadataRoute } from "next";

const base = "https://ravenspire.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/home", changeFrequency: "hourly", priority: 0.9 },
    { path: "/war", changeFrequency: "daily", priority: 0.8 },
    { path: "/throne", changeFrequency: "daily", priority: 0.8 },
    { path: "/raven", changeFrequency: "weekly", priority: 0.7 },
    { path: "/chronicle", changeFrequency: "monthly", priority: 0.6 },
    { path: "/renown", changeFrequency: "weekly", priority: 0.6 },
    { path: "/houses", changeFrequency: "daily", priority: 0.7 },
  ];

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
