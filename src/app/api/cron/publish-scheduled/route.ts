import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import {
  getMetricoolConfig,
  publishToMetricool,
  contentChannelToMetricool,
} from "@/lib/metricool";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { withCronLock } from "@/lib/cron-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * Cron de publicación automática de ContentPieces programadas.
 * Recorre piezas con status SCHEDULED cuyo scheduledAt <= ahora y las
 * empuja al canal correspondiente.
 *
 * Llamar 1x/5min desde cron-job.org:
 *   POST /api/cron/publish-scheduled
 *   Header X-Cron-Secret: <CRON_SECRET>
 *
 * Si falla, marca FAILED con channelResponse.error y avisa por Telegram.
 *
 * CLAIM-THEN-PUBLISH (2026-07-23): antes seleccionaba las piezas SCHEDULED,
 * publicaba y marcaba PUBLISHED DESPUÉS. Entre el SELECT y el marcado había una
 * ventana real: dos ejecuciones solapadas —el tick del cron y un disparo manual
 * desde /admin/system/crons, o dos ticks si uno se alarga— leían la misma pieza
 * en SCHEDULED y la publicaban DOS VECES en la red social, a la vista del
 * público. El comentario viejo decía "idempotente", pero esa idempotencia era
 * post-hoc y no cubría la ventana. Ahora cada transición sale de un
 * `updateMany` condicionado a `status: SCHEDULED`, que en una sola sentencia
 * atómica hace de cerrojo: solo un proceso obtiene count===1 y publica; el otro
 * ve count===0 y salta. Mismo patrón que post-order-drip y auto-proposal.
 *
 * Semántica deliberada: at-most-once. Se reclama ANTES de publicar, así que un
 * crash entre el claim y la publicación deja la pieza como PUBLISHED sin haber
 * salido, en vez de arriesgar una doble publicación. Para contenido público esa
 * es la dirección correcta del fallo: un post que no sale se ve y se reprograma;
 * uno duplicado ya no se puede retirar. Un fallo *devuelto* por Metricool sí se
 * corrige a FAILED, que es reintentable desde el panel.
 */
export const POST = wrapCronHandler("publish-scheduled", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  // TTL 3 min: mayor que maxDuration (120 s) y menor que la cadencia del cron
  // (*/5), para no bloquear nunca la siguiente ejecución legítima.
  return withCronLock("publish-scheduled", async () => {

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
  let claimedByOther = 0;
  const errors: string[] = [];

  /**
   * Saca la pieza de SCHEDULED en una sola sentencia atómica. Devuelve false si
   * otra ejecución se la llevó primero (count===0) — ahí hay que saltarla sin
   * tocar nada, porque el otro proceso ya es el dueño de esa publicación.
   */
  async function claim(id: string, data: Prisma.ContentPieceUpdateManyMutationInput) {
    const res = await prisma.contentPiece.updateMany({
      where: { id, status: "SCHEDULED" },
      data,
    });
    return res.count === 1;
  }

  for (const piece of due) {
    const metricoolChannel = contentChannelToMetricool(piece.channel);

    // Si el canal no es publicable vía Metricool (EMAIL/WEB/ADS), lo dejamos en
    // APPROVED — Mario lo maneja desde sus propias herramientas (Broadcasts/Ads).
    if (!metricoolChannel) {
      if (!(await claim(piece.id, {
        status: "APPROVED",
        channelResponse: {
          note: `Canal ${piece.channel} no publicable vía Metricool. Usar herramienta nativa.`,
          skippedAt: now.toISOString(),
        },
      }))) claimedByOther++;
      continue;
    }

    if (!metricoolCfg) {
      if (!(await claim(piece.id, {
        status: "FAILED",
        channelResponse: { error: "Metricool no configurado en /admin/integrations" },
      }))) {
        claimedByOther++;
        continue;
      }
      failed++;
      errors.push(`piece ${piece.id}: Metricool no configurado`);
      continue;
    }

    // Construir texto con hashtags al final
    const fullText = piece.hashtags.length > 0
      ? `${piece.copy}\n\n${piece.hashtags.map((h) => `#${h}`).join(" ")}`
      : piece.copy;

    // CLAIM antes de publicar: este updateMany es el cerrojo. Si no lo ganamos,
    // otra ejecución ya está publicando esta pieza — salir sin llamar a la red.
    if (!(await claim(piece.id, { status: "PUBLISHED", publishedAt: now }))) {
      claimedByOther++;
      continue;
    }

    const result = await publishToMetricool(metricoolCfg, {
      text: fullText,
      publicationDate: now,
      channels: [metricoolChannel],
      mediaUrls: piece.creativeUrl ? [piece.creativeUrl] : undefined,
      link: piece.productSlug ? `${SITE_URL}/catalogo/${piece.productSlug}?utm_source=metricool&utm_medium=${piece.channel.toLowerCase()}&utm_campaign=content&utm_content=${piece.id.slice(0, 8)}` : undefined,
      autoPublish: true,
    });

    if (result.ok) {
      // Ya está en PUBLISHED por el claim; queda anotar la respuesta del canal.
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          channelResponse: {
            externalIds: result.externalIds,
            publishedAt: now.toISOString(),
            via: "metricool",
          },
        },
      });
      published++;
    } else {
      // Metricool respondió error: la publicación NO salió, así que se corrige
      // el claim a FAILED (reintentable desde el panel).
      await prisma.contentPiece.update({
        where: { id: piece.id },
        data: {
          status: "FAILED",
          publishedAt: null,
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
      `📢 <b>Publicación auto</b>\n${published} OK · ${failed} fallidos${errors.length > 0 ? `\n${escapeTgHtml(errors.slice(0, 3).join("\n"))}` : ""}`,
    ).catch((e) =>
      console.error("[publish-scheduled] notifyTelegram falló:", e instanceof Error ? e.message : e),
    );
  }

  return NextResponse.json({
    ok: true,
    processed: due.length,
    published,
    failed,
    claimedByOther,
    errors,
  });
  }, 3 * 60 * 1000) as Promise<NextResponse>;
});
