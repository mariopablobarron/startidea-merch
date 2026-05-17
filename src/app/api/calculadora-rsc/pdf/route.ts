import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { RoiCertificatePDF } from "./RoiCertificatePDF";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Genera el certificado PDF del cálculo ROI RSC. Lo regenera on-demand
 * desde el RoiCalculation guardado (no cachea). Cada vez que el cliente
 * abre el link, vuelve a salir el mismo PDF.
 *
 * GET /api/calculadora-rsc/pdf?id=<roi-id>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const r = await prisma.roiCalculation.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

  const buffer = await renderToBuffer(RoiCertificatePDF({ calc: r }));

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificado-rsc-${r.id}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
