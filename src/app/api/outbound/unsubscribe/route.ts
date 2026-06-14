import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppressEmail } from "@/lib/outbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Baja pública de comunicaciones outbound (LSSI/RGPD). El destinatario llega
 * aquí desde el link del pie del email o el header List-Unsubscribe.
 *   GET  /api/outbound/unsubscribe?token=...   (click manual)
 *   POST /api/outbound/unsubscribe?token=...   (One-Click RFC 8058)
 * Añade su email a OutboundSuppression → no se le vuelve a escribir nunca.
 */
function page(msg: string): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja de comunicaciones</title></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#222;text-align:center;line-height:1.6;"><h1 style="font-size:20px;font-weight:600;">${msg}</h1><p style="color:#888;font-size:13px;margin-top:24px;">TodoMerchandising · Startidea Málaga SL</p></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handle(req: Request): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return page("Enlace de baja no válido.");
  const lead = await prisma.outboundLead.findUnique({ where: { unsubToken: token } });
  if (!lead || !lead.email) return page("Enlace de baja no válido o caducado.");
  await suppressEmail(lead.email, "opt-out");
  return page("Hecho. No volverás a recibir más comunicaciones nuestras. Gracias.");
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
