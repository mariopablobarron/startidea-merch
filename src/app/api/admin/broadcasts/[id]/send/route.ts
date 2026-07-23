import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { resend, MARKETING_FROM, MARKETING_REPLY_TO, sendEmail } from "@/lib/resend";
import { sendBroadcast, applyFooter } from "@/lib/broadcast-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min para audiencias grandes

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const TestSchema = z.object({
  testEmail: z.string().email(),
});

/**
 * POST /api/admin/broadcasts/[id]/send
 *
 * Envía el broadcast:
 *   - Sin body  → envía a TODA la audiencia (status DRAFT/SCHEDULED → SENT)
 *   - { testEmail: "..." } → envía SOLO a ese email (no cambia status)
 *
 * El envío real vive en lib/broadcast-send.ts (compartido con el cron de
 * programados): bloqueo atómico anti-doble-envío + throttle anti-rate-limit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  if (!resend) {
    return NextResponse.json({ error: "Resend no configurado" }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const isTest = body && typeof body.testEmail === "string";

  // ── Caso TEST: envía a un solo email ─────────────────────────
  if (isTest) {
    const broadcast = await prisma.emailBroadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const parsed = TestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

    // sendEmail dispara alerta Telegram automática si Resend falla.
    const result = await sendEmail({
      to: parsed.data.testEmail,
      from: MARKETING_FROM,
      replyTo: MARKETING_REPLY_TO,
      subject: `[TEST] ${broadcast.subject}`,
      html: applyFooter(
        broadcast.html,
        `${SITE_URL}/api/newsletter/unsubscribe?token=test`,
        broadcast.preheader,
      ),
      context: `broadcast test · ${broadcast.id}`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: parsed.data.testEmail, test: true });
  }

  // ── Caso REAL: envía a la audiencia ──────────────────────────
  const res = await sendBroadcast(id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 500 });
  }
  return NextResponse.json({
    ok: true,
    audienceSize: res.audienceSize,
    sentCount: res.sentCount,
    failedCount: res.failedCount,
  });
}
