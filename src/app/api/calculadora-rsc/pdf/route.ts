import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { acquireInFlight } from "@/lib/in-flight-limit";
import { RoiCertificatePDF } from "./RoiCertificatePDF";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Genera el certificado PDF del cálculo ROI RSC. Lo regenera on-demand
 * desde el RoiCalculation guardado (no cachea). Cada vez que el cliente
 * abre el link, vuelve a salir el mismo PDF.
 *
 * GET /api/calculadora-rsc/pdf?id=<roi-id>
 *
 * ⚠️ Es pública, sin auth, y `renderToBuffer` compone el PDF entero en el
 * proceso EN CADA petición: no hay caché intermedia que la absorba
 * (`Cache-Control: private`). Por eso lleva los dos topes del patrón, no uno:
 *
 *   1. `rateLimit` — por IP, contra el abuso de un cliente concreto.
 *   2. `acquireInFlight` — GLOBAL, contra el OOM: N IPs distintas pidiendo una
 *      vez cada una apilan N renders simultáneos, que es el modo de fallo que
 *      ya ha tirado este VPS dos veces.
 *
 * Hoy la ruta es deuda LATENTE, no un agujero vivo: `RoiCalculation` está
 * vacía, así que el `findUnique` sale por el 404 antes de renderizar nada, y
 * `access.log` de Traefik no registra ni una petición desde el 31-ago. Se
 * blinda ahora porque el día que alguien complete el formulario pasa a ser
 * alcanzable de verdad, y entonces ya no hay ventana para pensarlo.
 */
export async function GET(req: Request) {
  const rl = rateLimit(req, { key: "calculadora-rsc-pdf", max: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const r = await prisma.roiCalculation.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

  // Slot GLOBAL: se pide DESPUÉS del 404 para que un id inexistente —hoy,
  // todos— no llegue a ocupar el cerrojo, y se libera en `finally` para que
  // una excepción del render no lo deje cerrado hasta el próximo recreate.
  const slot = acquireInFlight({
    key: "calculadora-rsc-pdf",
    max: 2,
    retryAfterSeconds: 20,
    message: "El certificado se está generando para otra persona. Inténtalo en unos segundos.",
  });
  if (!slot.ok) return slot.response;

  try {
    const buffer = await renderToBuffer(RoiCertificatePDF({ calc: r }));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificado-rsc-${r.id}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } finally {
    slot.release();
  }
}
