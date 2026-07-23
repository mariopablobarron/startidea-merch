import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Rutas privadas / con token / transaccionales: fuera del crawl para no
        // gastar crawl budget (ya van noindex a nivel HTML, pero mejor no crawlear).
        disallow: [
          "/api/",
          "/admin",
          "/carrito",
          "/clientes",
          "/pay",
          "/proof",
          "/review",
          "/afiliado",
          "/share",
          // Las páginas legales (aviso-legal/privacidad/cookies) NO se
          // bloquean: van en el sitemap y tenerlas también en disallow
          // provocaba "Enviada, bloqueada por robots.txt" en Search Console.
        ],
      },
      // Permitimos AI crawlers — usamos /llms.txt como índice curado.
      // Si más adelante quieres bloquear alguno concreto (GPTBot, etc.),
      // añade una rule específica con disallow: ["/"].
    ],
    sitemap: [`${BASE}/sitemap.xml`, `${BASE}/blog/rss.xml`],
    host: BASE,
  };
}
