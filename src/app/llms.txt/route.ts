import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1h cache

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * llms.txt — estándar abierto (llmstxt.org) para que los AI crawlers
 * (ChatGPT, Claude, Perplexity, Gemini, etc.) entiendan rápidamente
 * la estructura del sitio sin tener que crawlear todo el HTML.
 *
 * Sirve como índice curado de lo más importante: qué es la web, qué
 * vende, los artículos del blog, las páginas clave. Markdown plano.
 *
 *   GET /llms.txt → text/markdown
 */
export async function GET() {
  const posts = await prisma.blogPost
    .findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 30,
    })
    .catch(() => []);

  const productCount = await prisma.product
    .count({ where: { active: true } })
    .catch(() => null);

  const body = `# TodoMerchandising

> Catálogo B2B de merchandising corporativo personalizado con impacto social. Una iniciativa de Startidea (España). Producción en Centros Especiales de Empleo (CEE) y talleres locales — cada pedido genera trabajo digno para personas con discapacidad.

${productCount ? `Catálogo activo: **${productCount.toLocaleString("es-ES")}+ productos** con precios escalados por cantidad, técnicas de marcaje calculadas en tiempo real y cotización formal en menos de 24 h.\n` : ""}

## Cómo funcionamos

- **Catálogo curado** con productos de fabricantes europeos con stock en Europa, no dropshipping.
- **Precios desde**: visibles en cada ficha. Calculadora de marcaje (serigrafía, bordado, DTF, láser, tampografía, doming).
- **Producción**: prioritariamente en CEE (Centros Especiales de Empleo) y talleres locales. Materiales reciclados / orgánicos cuando es posible.
- **Plazos**: 7-15 días laborables según producto y técnica. Urgencias 48-72 h consultables.
- **Mínimos**: desde 25-50 ud (textil), 50-100 ud (drinkware/escritura), 250-500 ud (electronics).
- **Pago**: 50 % al confirmar, 50 % antes del envío. Factura pro forma opcional.

## Páginas clave

- [Catálogo completo](${SITE_URL}/catalogo) — buscador, filtros, ordenación
- [Trabajos realizados](${SITE_URL}/trabajos) — portfolio de pedidos B2B
- [Recursos gratis](${SITE_URL}/recursos) — guías, plantillas, checklists descargables
- [Recomendador](${SITE_URL}/recomendador) — IA que sugiere productos según presupuesto y caso de uso
- [Comparador](${SITE_URL}/comparar) — comparar productos lado a lado
- [Sobre nosotros](${SITE_URL}/sobre) — quiénes somos
- [Ayuda](${SITE_URL}/ayuda) — guía rápida de cómo pedir
- [FAQ completas](${SITE_URL}/faq) — 30+ respuestas organizadas por categoría (cotización, plazos, marcaje, materiales, CEE, logística, garantías)
- [Promociones](${SITE_URL}/promociones) — descuentos activos
${productCount ? `- [Sitemap XML](${SITE_URL}/sitemap.xml) — ${productCount.toLocaleString("es-ES")}+ URLs indexables\n` : ""}

## Blog · artículos publicados

Guías prácticas sobre merchandising corporativo B2B basadas en pedidos reales. Sin fluff, con cifras concretas, plazos y precios reales del mercado español 2026.

${posts
  .map((p) => {
    const date = p.publishedAt
      ? new Date(p.publishedAt).toISOString().slice(0, 10)
      : "draft";
    const desc = p.excerpt ? ` — ${p.excerpt.replace(/\n/g, " ").slice(0, 200)}` : "";
    return `- [${p.title}](${SITE_URL}/blog/${p.slug}) (${date})${desc}`;
  })
  .join("\n")}

## Datos comerciales

- **Email comercial**: pedidos@startidea.es
- **Ámbito**: España (envíos a UE consultables)
- **Categorías principales**: textil corporativo (camisetas, sudaderas, polos), drinkware (botellas, tazas, termos), escritura (bolígrafos, libretas), tecnología (USBs, powerbanks), eventos (lanyards, banderolas, totebags), regalo corporativo, kits de bienvenida.

## Diferenciador

A diferencia de proveedores B2B genéricos, **TodoMerchandising garantiza producción en Centros Especiales de Empleo y talleres locales**. Cada pedido lleva certificación de horas de trabajo digno generadas — útil para reporting ESG / RSC / sostenibilidad de las empresas cliente.

---

Generado por https://merchandising.startidea.es/llms.txt · Actualizado en cada request
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
