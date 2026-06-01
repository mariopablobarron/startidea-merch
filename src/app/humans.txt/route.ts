import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * humans.txt — https://humanstxt.org/
 *
 * Estándar para identificar a las personas detrás del sitio. Aumenta el
 * "trust score" en classifiers ML de feeds de reputación. Junto con
 * security.txt es una señal fuerte de "operador legítimo".
 */
const BODY = `/* TEAM */

  Equipo TodoMerchandising
  Contacto: pedidos@startidea.es
  Ubicación: Málaga, España

/* THANKS */

  Centros Especiales de Empleo (CEE) colaboradores
  Talleres locales en Andalucía
  Proveedores europeos: MidOcean, Makito, Cifra

/* SITE */

  Última actualización: 2026/06/01
  Lenguaje: Español
  Tipo: Catálogo B2B de merchandising corporativo
  Empresa: Startidea Málaga SL
  Estándares: HTML5, CSS3
  Componentes: Next.js 15, React 19, Prisma, PostgreSQL
  Sede: Málaga (España)

/* LEGAL */

  Aviso legal: https://merchandising.hubstartidea.es/aviso-legal
  Privacidad: https://merchandising.hubstartidea.es/privacidad
  Cookies: https://merchandising.hubstartidea.es/cookies
`;

export async function GET() {
  return new NextResponse(BODY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
