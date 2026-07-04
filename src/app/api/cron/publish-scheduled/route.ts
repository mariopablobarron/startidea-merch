import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import {
  getMetricoolConfig,
  publishToMetricool,
  contentChannelToMetricool,
} from "@/lib/metricool";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Cron de publicación automática de ContentPieces programadas.
 * Recorre piezas con status SCHEDULED cuyo scheduledAt <= ahora y las
 * empuja al canal correspondiente.
 *
 * Llamar 1x/5min desde cron-job.org:
 *   POST /api/cron/publish-scheduled
 *   Header X-Cron-Secret: <CRON_SECRET>
 *
 * Idempotente: marca PUBLISHED tras enviar (no se reintenta). Si falla,
 * marca FAILED con channelResponse.error y avisa por Telegram.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = new Date();
  const due = await prisma.contentPiece.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50, // batch máximo por ejecución
  });

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const metricoolCfg = await getMetricoolConfig();

  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const piece of due) {
    const metricoolChannel = contentChannelToMetricool(piece.channel);

    // Si el canal no es publicable vía Metricool (EMAIL/WEB/ADS), lo dejamos en
    // APPROVED — Mario lo maneja desde sus propias herramientas (Broadcasts/Ads).
    if (!metricoolChannel) {
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          status: "APPROVED",
          channelResponse: {
            note: `Canal ${piece.channel} no publicable vía Metricool. Usar herramienta nativa.`,
            skippedAt: now.toISOString(),
          },
        },
      });
      continue;
    }

    if (!metricoolCfg) {
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          status: "FAILED",
          channelResponse: { error: "Metricool no configurado en /admin/integrations" },
        },
      });
      failed++;
      errors.push(`piece ${piece.id}: Metricool no configurado`);
      continue;
    }

    // Construir texto con hashtags al final
    const fullText = piece.hashtags.length > 0
      ? `${piece.copy}\n\n${piece.hashtags.map((h) => `#${h}`).join(" ")}`
      : piece.copy;

    const result = await publishToMetricool(metricoolCfg, {
      text: fullText,
      publicationDate: now,
      channels: [metricoolChannel],
      mediaUrls: piece.creativeUrl ? [piece.creativeUrl] : undefined,
      link: piece.productSlug ? `${SITE_URL}/catalogo/${piece.productSlug}?utm_source=metricool&utm_medium=${piece.channel.toLowerCase()}&utm_campaign=content&utm_content=${piece.id.slice(0, 8)}` : undefined,
      autoPublish: true,
    });

    if (result.ok) {
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          status: "PUBLISHED",
          publishedAt: now,
          channelResponse: {
            externalIds: result.externalIds,
            publishedAt: now.toISOString(),
            via: "metricool",
          },
        },
      });
      published++;
    } else {
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          status: "FAILED",
          channelResponse: { error: result.error, failedAt: now.toISOString() },
        },
      });
      failed++;
      errors.push(`piece ${piece.id}: ${result.error}`);
    }
  }

  // Notificar a Telegram si algo se publicó o falló
  if (published > 0 || failed > 0) {
    void notifyTelegram(
      `📢 <b>Publicación auto</b>\n${published} OK · ${failed} fallidos${errors.length > 0 ? `\n${errors.slice(0, 3).join("\n")}` : ""}`,
    ).catch((e) =>
      console.error("[publish-scheduled] notifyTelegram falló:", e instanceof Error ? e.message : e),
    );
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    published,
    failed,
    errors,
  });
}
