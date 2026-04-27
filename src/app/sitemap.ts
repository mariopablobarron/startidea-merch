import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/sobre`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/aviso-legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
