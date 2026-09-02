import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { sendBroadcast } from "@/lib/broadcast-send";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { wrapCronHandler } from "@/lib/cron-tracking";

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
export const POST = wrapCronHandler("send-scheduled-broadcasts", async (req: Request) => {
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
      // El asunto lo escribe el admin en el panel ("Ofertas de verano <30% dto>") y el
      // error lo devuelve Resend: los dos son texto libre. Se escapan solo al pintar el
      // mensaje, para no cambiar lo que sale en el JSON de la respuesta del cron.
      results
        .map((r) =>
          r.ok
            ? `✓ ${escapeTgHtml(r.subject.slice(0, 60))} — ${r.sent} OK${r.failed ? ` / ${r.failed} fallidos` : ""}`
            : `✕ ${escapeTgHtml(r.subject.slice(0, 60))} — ${escapeTgHtml(r.error)}`,
        )
        .join("\n"),
  ).catch((e) =>
    console.error("[send-scheduled-broadcasts] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true, processed: due.length, sentTotal, results });
});
