import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { renderProposalPdf } from "@/lib/proposal-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Genera y devuelve el PDF de propuesta comercial para un CartQuote.
 *  - Auth admin obligatoria
 *  - Header Content-Disposition: inline (preview en navegador)
 *  - ?download=1 → attachment para forzar descarga
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  const buffer = await renderProposalPdf(cart);
  const url = new URL(req.url);
  const isDownload = url.searchParams.get("download") === "1";
  const filename = `Cotizacion-${(cart.company || cart.name).replace(/[^a-z0-9-]+/gi, "_")}-${id.slice(0, 6)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
