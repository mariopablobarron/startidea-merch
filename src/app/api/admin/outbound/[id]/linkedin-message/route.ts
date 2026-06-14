import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { generateLinkedInMessages } from "@/lib/linkedin-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/outbound/[id]/linkedin-message
 *
 * Genera con IA los mensajes de LinkedIn (nota de conexión + primer mensaje +
 * seguimiento) para un lead. NO envía nada: devuelve el texto para que el admin
 * lo copie y pegue manualmente en LinkedIn (cumple ToS de LinkedIn).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const lead = await prisma.outboundLead.findUnique({
    where: { id },
    select: { name: true, company: true, role: true, segment: true, linkedinUrl: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const result = await generateLinkedInMessages(lead);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, messages: result.messages, linkedinUrl: lead.linkedinUrl });
}
