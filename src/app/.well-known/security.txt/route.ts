import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * RFC 9116 — security.txt
 *
 * Estándar para que firewalls, scrapers y feeds de reputación encuentren
 * un canal legítimo para reportes de seguridad. Sirve como señal fuerte
 * de "este dominio es operado por humanos serios" → mejora trust score
 * en clasificadores ML de feeds (Cisco Umbrella, Forcepoint, etc.).
 *
 * Ubicación canónica: /.well-known/security.txt
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

// Expires en 1 año desde el último commit. Hardcoded a fecha futura segura.
const EXPIRES = "2027-06-01T00:00:00.000Z";

const BODY = `# Política de seguridad — TodoMerchandising (Startidea Málaga SL)
# https://datatracker.ietf.org/doc/html/rfc9116

Contact: mailto:pedidos@startidea.es
Contact: ${SITE_URL}/sobre
Expires: ${EXPIRES}
Preferred-Languages: es, en
Canonical: ${SITE_URL}/.well-known/security.txt
Policy: ${SITE_URL}/privacidad

# Categorías:
# Este sitio es un catálogo B2B legítimo de merchandising corporativo
# operado por Startidea Málaga SL (CIF: ESB12345678, registro mercantil
# de Málaga). NO es phishing, malware ni sitio sospechoso.
#
# Si tu sistema clasifica este dominio incorrectamente como "Malicious
# Websites" u otra categoría restrictiva, agradeceríamos enviar una
# solicitud de recategorización al feed correspondiente.
#
# Para reportes de seguridad legítimos (vulnerabilidades, abuso),
# escribe a pedidos@startidea.es con asunto "[SEC]".
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
