import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Audit de crons externos. No depende de que los crons escriban a una tabla
 * común — infiere la última ejecución observando la huella en BD que cada
 * cron deja al hacer su trabajo.
 *
 * Para cada cron:
 *   - frequencyHours: cada cuánto se espera que corra (humano)
 *   - lastEvidenceAt: timestamp de la última señal en BD
 *   - status:
 *       OK         → ejecutado dentro de su ventana esperada (× 1.5)
 *       STALE      → última señal vieja (>= 1.5 × frecuencia)
 *       NEVER      → sin huella histórica (puede ser que el cron no se haya
 *                    configurado en cron-job.org o que no haya trabajo que hacer)
 *       UNDETECTABLE → no podemos inferirlo por BD (sólo logs Telegram).
 *
 * Nota: STALE/NEVER puede ser falso positivo si el cron corre pero no hay
 * trabajo (no upsert/insert). El analista lo evalúa.
 */

type CronStatus = "OK" | "STALE" | "NEVER" | "UNDETECTABLE";

type CronReport = {
  name: string;
  endpoint: string;
  frequencyHours: number;
  evidenceSource: string;
  lastEvidenceAt: string | null;
  hoursSince: number | null;
  status: CronStatus;
  note?: string;
};

function classify(
  lastAt: Date | null,
  frequencyHours: number,
  options?: { eligibleCandidates?: number },
): { status: CronStatus; hoursSince: number | null } {
  if (!lastAt) return { status: "NEVER", hoursSince: null };
  const hours = (Date.now() - lastAt.getTime()) / 3_600_000;
  if (hours <= frequencyHours * 1.5) return { status: "OK", hoursSince: hours };
  // STALE sólo si hay trabajo elegible ahora mismo. Si no, OK con nota.
  if (options && typeof options.eligibleCandidates === "number" && options.eligibleCandidates === 0) {
    return { status: "OK", hoursSince: hours };
  }
  return { status: "STALE", hoursSince: hours };
}

async function buildReport(): Promise<CronReport[]> {
  const reports: CronReport[] = [];

  // 1. midocean-sync — evidencia: SupplierSync.finishedAt
  {
    const r = await prisma.supplierSync.findUnique({
      where: { supplier: "midocean" },
      select: { finishedAt: true, ok: true },
    });
    const c = classify(r?.finishedAt ?? null, 24);
    reports.push({
      name: "midocean-sync",
      endpoint: "/api/cron/midocean-sync",
      frequencyHours: 24,
      evidenceSource: "SupplierSync.finishedAt",
      lastEvidenceAt: r?.finishedAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: r?.ok === false ? "Última corrida marcada con errores" : undefined,
    });
  }

  // 2. midocean-print-pricelist-sync — evidencia: MarkingPricelistSync.fetchedAt
  {
    const r = await prisma.markingPricelistSync.findFirst({
      where: { supplier: "midocean" },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    const c = classify(r?.fetchedAt ?? null, 24 * 7);
    reports.push({
      name: "midocean-print-pricelist-sync",
      endpoint: "/api/cron/midocean-print-pricelist-sync",
      frequencyHours: 24 * 7,
      evidenceSource: "MarkingPricelistSync.fetchedAt",
      lastEvidenceAt: r?.fetchedAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
    });
  }

  // 3. embeddings-sync — evidencia: ProductEmbedding.createdAt (max)
  {
    const r = await prisma.productEmbedding.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const c = classify(r?.createdAt ?? null, 24);
    reports.push({
      name: "embeddings-sync",
      endpoint: "/api/cron/embeddings-sync",
      frequencyHours: 24,
      evidenceSource: "ProductEmbedding.createdAt (max)",
      lastEvidenceAt: r?.createdAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: c.status === "NEVER" ? "Feature pendiente activar — OPENAI_API_KEY?" : undefined,
    });
  }

  // 4. webhook-retry — proxy: WebhookDelivery.nextRetryAt vencido + status=FAILED
  {
    const stuck = await prisma.webhookDelivery.count({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        nextRetryAt: { lt: new Date() },
      },
    });
    const lastSuccess = await prisma.webhookDelivery.findFirst({
      where: { status: "DELIVERED" },
      orderBy: { deliveredAt: "desc" },
      select: { deliveredAt: true },
    });
    reports.push({
      name: "webhook-retry",
      endpoint: "/api/cron/webhook-retry",
      frequencyHours: 0.25, // 15 min
      evidenceSource: "WebhookDelivery (stuck retries pendientes)",
      lastEvidenceAt: lastSuccess?.deliveredAt?.toISOString() ?? null,
      hoursSince: lastSuccess?.deliveredAt
        ? (Date.now() - lastSuccess.deliveredAt.getTime()) / 3_600_000
        : null,
      status: stuck > 0 ? "STALE" : lastSuccess ? "OK" : "NEVER",
      note: stuck > 0 ? `${stuck} deliveries vencidos sin reintentar` : "Sin webhooks que requieran retry",
    });
  }

  // 5. refresh-tracking — evidencia: OrderTracking.fetchedAt (max)
  {
    const r = await prisma.orderTracking.findFirst({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    });
    const c = classify(r?.fetchedAt ?? null, 24);
    reports.push({
      name: "refresh-tracking",
      endpoint: "/api/cron/refresh-tracking",
      frequencyHours: 24,
      evidenceSource: "OrderTracking.fetchedAt (max)",
      lastEvidenceAt: r?.fetchedAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: c.status === "NEVER" ? "Sin pedidos ORDERED con tracking todavía" : undefined,
    });
  }

  // 6. improve-descriptions — evidencia: Product.enhancedAt (max)
  {
    const r = await prisma.product.findFirst({
      where: { enhancedAt: { not: null } },
      orderBy: { enhancedAt: "desc" },
      select: { enhancedAt: true },
    });
    const c = classify(r?.enhancedAt ?? null, 24);
    reports.push({
      name: "improve-descriptions",
      endpoint: "/api/cron/improve-descriptions",
      frequencyHours: 24,
      evidenceSource: "Product.enhancedAt (max)",
      lastEvidenceAt: r?.enhancedAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: c.status === "NEVER" ? "Feature opcional — sólo si OpenRouter activo" : undefined,
    });
  }

  // 7. publish-scheduled — evidencia: ContentPiece.publishedAt (max) status=PUBLISHED
  {
    const r = await prisma.contentPiece.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    });
    const pending = await prisma.contentPiece.count({
      where: { status: "SCHEDULED", scheduledAt: { lt: new Date() } },
    });
    reports.push({
      name: "publish-scheduled",
      endpoint: "/api/cron/publish-scheduled",
      frequencyHours: 1, // expected ~5min, suavizamos a 1h
      evidenceSource: "ContentPiece.publishedAt (max) + SCHEDULED vencidas",
      lastEvidenceAt: r?.publishedAt?.toISOString() ?? null,
      hoursSince: r?.publishedAt
        ? (Date.now() - r.publishedAt.getTime()) / 3_600_000
        : null,
      status:
        pending > 0
          ? "STALE"
          : r?.publishedAt
            ? "OK"
            : "NEVER",
      note:
        pending > 0
          ? `${pending} piezas SCHEDULED vencidas sin publicar — cron no corre`
          : "Sin piezas programadas pendientes",
    });
  }

  // 8. stock-alert — sin huella BD (sólo Telegram)
  reports.push({
    name: "stock-alert",
    endpoint: "/api/cron/stock-alert",
    frequencyHours: 24,
    evidenceSource: "(sólo notifica a Telegram, no escribe BD)",
    lastEvidenceAt: null,
    hoursSince: null,
    status: "UNDETECTABLE",
    note: "Verificar manualmente en chat Telegram",
  });

  // 9. abandoned-cart-drip — evidencia: EmailDripSent step ∈ {1,3,7,30}
  {
    const r = await prisma.emailDripSent.findFirst({
      where: { step: { in: [1, 3, 7, 30] } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    // Candidatos elegibles ahora: carritos NEW/IN_PROGRESS con edad entre 24-48h
    // sin EmailDripSent step=1 (la ventana más amplia para evitar falsos negativos)
    const eligible = await prisma.cartQuote.count({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        createdAt: {
          lt: new Date(Date.now() - 24 * 3_600_000),
          gt: new Date(Date.now() - 30 * 24 * 3_600_000),
        },
      },
    });
    const c = classify(r?.sentAt ?? null, 24, { eligibleCandidates: eligible });
    reports.push({
      name: "abandoned-cart-drip",
      endpoint: "/api/cron/abandoned-cart-drip",
      frequencyHours: 24,
      evidenceSource: "EmailDripSent (step 1/3/7/30) sentAt max",
      lastEvidenceAt: r?.sentAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note:
        eligible === 0
          ? "Sin candidatos elegibles ahora (necesita CartQuote NEW/IN_PROGRESS >24h)"
          : c.status === "STALE"
            ? `${eligible} candidatos elegibles sin atender`
            : undefined,
    });
  }

  // 10. review-invite — evidencia: Review.invitedAt max
  {
    const r = await prisma.review.findFirst({
      orderBy: { invitedAt: "desc" },
      select: { invitedAt: true },
    });
    const c = classify(r?.invitedAt ?? null, 24);
    reports.push({
      name: "review-invite",
      endpoint: "/api/cron/review-invite",
      frequencyHours: 24,
      evidenceSource: "Review.invitedAt (max)",
      lastEvidenceAt: r?.invitedAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: c.status === "NEVER" ? "Sin pedidos entregados todavía" : undefined,
    });
  }

  // 11. backup-db — sin huella BD (sólo Telegram)
  reports.push({
    name: "backup-db",
    endpoint: "/api/cron/backup-db",
    frequencyHours: 24,
    evidenceSource: "(sólo sube .sql.gz a Telegram, no escribe BD)",
    lastEvidenceAt: null,
    hoursSince: null,
    status: "UNDETECTABLE",
    note: "Verificar manualmente en chat Telegram (debe llegar diario)",
  });

  // 12. post-order-drip — evidencia: EmailDripSent step ∈ {0,14,45}
  {
    const r = await prisma.emailDripSent.findFirst({
      where: { step: { in: [0, 14, 45] } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    const c = classify(r?.sentAt ?? null, 24);
    reports.push({
      name: "post-order-drip",
      endpoint: "/api/cron/post-order-drip",
      frequencyHours: 24,
      evidenceSource: "EmailDripSent (step 0/14/45) sentAt max",
      lastEvidenceAt: r?.sentAt?.toISOString() ?? null,
      hoursSince: c.hoursSince,
      status: c.status,
      note: c.status === "NEVER" ? "Sin pedidos entregados aún" : undefined,
    });
  }

  return reports;
}

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const reports = await buildReport();
  const summary = {
    OK: reports.filter((r) => r.status === "OK").length,
    STALE: reports.filter((r) => r.status === "STALE").length,
    NEVER: reports.filter((r) => r.status === "NEVER").length,
    UNDETECTABLE: reports.filter((r) => r.status === "UNDETECTABLE").length,
    total: reports.length,
  };
  return NextResponse.json({ summary, reports, generatedAt: new Date().toISOString() });
}
