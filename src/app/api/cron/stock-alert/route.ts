import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { notifyTelegram } from "@/lib/telegram";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diario — alerta a Telegram con resumen de stock crítico/agotado.
 *
 * Configurar 1x/día en cron-job.org:
 *   POST https://merchandising.startidea.es/api/cron/stock-alert
 *   Header: X-Cron-Secret: <CRON_SECRET>
 *   Cadence: 0 9 * * *  (9am hora local — antes de turno comercial)
 *
 * Solo dispara mensaje si hay >0 productos críticos. No spam si todo bien.
 */
export const POST = wrapCronHandler("stock-alert", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  type Row = { id: string; name: string; supplier_ref: string; total_stock: bigint };

  const [soldOut, critical, stale] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT p."id", p."name", p."supplierRef" AS supplier_ref,
             COALESCE(SUM(v."stockQty"),0)::BIGINT AS total_stock
      FROM "Product" p
      LEFT JOIN "ProductVariant" v ON v."productId" = p."id"
      LEFT JOIN "ProductOverride" o ON o."productId" = p."id"
      WHERE p."active" = TRUE
        AND (o."hidden" IS NULL OR o."hidden" = FALSE)
      GROUP BY p."id"
      HAVING COALESCE(SUM(v."stockQty"),0) = 0
      ORDER BY p."name" ASC
      LIMIT 30
    `,
    prisma.$queryRaw<Row[]>`
      SELECT p."id", p."name", p."supplierRef" AS supplier_ref,
             COALESCE(SUM(v."stockQty"),0)::BIGINT AS total_stock
      FROM "Product" p
      LEFT JOIN "ProductVariant" v ON v."productId" = p."id"
      LEFT JOIN "ProductOverride" o ON o."productId" = p."id"
      WHERE p."active" = TRUE
        AND (o."hidden" IS NULL OR o."hidden" = FALSE)
      GROUP BY p."id"
      HAVING COALESCE(SUM(v."stockQty"),0) > 0
        AND COALESCE(SUM(v."stockQty"),0) <= 20
      ORDER BY total_stock ASC
      LIMIT 20
    `,
    prisma.product.count({
      where: {
        active: true,
        syncedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  if (soldOut.length === 0 && critical.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "Sin alertas" });
  }

  const lines: string[] = ["📦 <b>Alerta de stock</b>"];

  if (soldOut.length > 0) {
    lines.push("");
    lines.push(`<b>${soldOut.length} agotados</b>:`);
    for (const p of soldOut.slice(0, 8)) {
      lines.push(`• ${p.name} <code>${p.supplier_ref}</code>`);
    }
    if (soldOut.length > 8) lines.push(`  …y ${soldOut.length - 8} más`);
  }

  if (critical.length > 0) {
    lines.push("");
    lines.push(`<b>${critical.length} stock crítico (≤20 uds)</b>:`);
    for (const p of critical.slice(0, 8)) {
      lines.push(`• ${p.name} — ${Number(p.total_stock)} uds`);
    }
    if (critical.length > 8) lines.push(`  …y ${critical.length - 8} más`);
  }

  if (stale > 7) {
    lines.push("");
    lines.push(`⚠️ ${stale} productos sin sync hace +7 días`);
  }

  lines.push("");
  lines.push(
    `<a href="https://merchandising.startidea.es/admin/stock">Ver panel completo →</a>`,
  );

  await notifyTelegram(lines.join("\n")).catch((e) =>
    console.error("[stock-alert] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({
    ok: true,
    sent: true,
    soldOut: soldOut.length,
    critical: critical.length,
    stale,
  });
});
