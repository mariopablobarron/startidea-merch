import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/aviso-legal", "/privacidad", "/cookies"],
      },
      // Permitimos AI crawlers — usamos /llms.txt como índice curado.
      // Si más adelante quieres bloquear alguno concreto (GPTBot, etc.),
      // añade una rule específica con disallow: ["/"].
    ],
    sitemap: [`${BASE}/sitemap.xml`, `${BASE}/blog/rss.xml`],
    host: BASE,
  };
}
