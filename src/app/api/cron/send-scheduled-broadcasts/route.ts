import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { sendBroadcast } from "@/lib/broadcast-send";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron de envío de broadcasts programados.
 * Recorre EmailBroadcast con status=SCHEDULED y scheduledAt <= ahora y los
 * envía vía lib/broadcast-send (mismo código que el botón "Enviar ahora",
 * con bloqueo atómico → seguro ante solapamiento con un envío manual).
 *
 * Llamar cada ~5 min:
 *   POST /api/cron/send-scheduled-broadcasts   Header X-Cron-Secret: <CRON_SECRET>
 *
 * Idempotente: el bloqueo SENDABLE→SENDING evita doble envío. Procesa como
 * mucho 3 por ejecución (el envío es síncrono y con throttle); el resto
 * espera al siguiente tick.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = new Date();
  const due = await prisma.emailBroadcast.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: 3,
    select: { id: true, subject: true },
  });

  if (due.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  const results: { id: string; subject: string; ok: boolean; sent?: number; failed?: number; error?: string }[] = [];
  for (const b of due) {
    const r = await sendBroadcast(b.id);
    results.push(
      r.ok
        ? { id: b.id, subject: b.subject, ok: true, sent: r.sentCount, failed: r.failedCount }
        : { id: b.id, subject: b.subject, ok: false, error: r.error },
    );
  }

  const sentTotal = results.reduce((a, r) => a + (r.sent ?? 0), 0);
  void notifyTelegram(
    `📨 <b>Broadcasts programados enviados</b>\n` +
      results
        .map((r) =>
          r.ok
            ? `✓ ${r.subject.slice(0, 60)} — ${r.sent} OK${r.failed ? ` / ${r.failed} fallidos` : ""}`
            : `✕ ${r.subject.slice(0, 60)} — ${r.error}`,
        )
        .join("\n"),
  ).catch(() => {});

  return NextResponse.json({ ok: true, processed: due.length, sentTotal, results });
}
