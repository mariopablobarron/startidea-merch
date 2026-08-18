import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { escapeTgHtml, notifyTelegram } from "@/lib/telegram";
import { evaluarDrift } from "@/lib/override-drift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Watchdog de OVERRIDES de precio desfasados.
 *
 * Un override con customFromPriceCents FIJA el precio cliente. Pero el neto
 * del proveedor (Product.fromPriceCents, refrescado por los syncs) sigue
 * moviéndose: si sube, el margen implícito del override se hunde en silencio
 * — nadie lo ve hasta que se vende a pérdida.
 *
 * Regla: margen implícito = customFromPriceCents / fromPriceCents(neto).
 *   - < 1.0  → CRÍTICO: vendiendo POR DEBAJO de coste.
 *   - < 1.3  → aviso: margen implícito bajo el 23% sobre venta (el global es 1,6667×
 *              = 40% sobre venta).
 * Solo avisa (Telegram + respuesta JSON); no toca precios — decisión humana.
 *
 * La regla SOLO vale si `fromPriceCents` es COSTE. Para los proveedores de
 * `PRECIO_GUARDADO_ES_PVP` no lo es, y compararlo con el override es comparar un
 * número consigo mismo: da ratio 1,00 y dispara el aviso siempre. Eso hacía desde
 * el 13-jul-2026 — seis avisos semanales seguidos de "59 overrides desfasados",
 * los 59 de Adivin, todos falsos. Un watchdog que grita cada semana sin motivo
 * deja de leerse, y el día que haya una deriva REAL llegará en el mismo mensaje
 * que los 59 de siempre. Se excluyen del veredicto y se reportan aparte como lo
 * que son: no auditables mientras no tengamos su coste de compra en la BD.
 *
 * La regla vive en `@/lib/override-drift` (módulo puro, con tests): un route
 * handler no puede exportar nada más que sus métodos HTTP, y tenerla aquí
 * dentro es lo que la dejó seis semanas sin una sola prueba.
 *
 * Llamar 1x/semana:  POST /api/cron/override-price-drift  (X-Cron-Secret)
 */

export const POST = wrapCronHandler("override-price-drift", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const overrides = await prisma.productOverride.findMany({
    where: { customFromPriceCents: { not: null } },
    select: {
      customFromPriceCents: true,
      product: {
        select: { slug: true, name: true, fromPriceCents: true, active: true, supplier: true },
      },
    },
  });

  const drifted: Array<{
    slug: string;
    name: string;
    clientCents: number;
    netCents: number;
    ratio: number;
    belowCost: boolean;
  }> = [];

  const noAuditables: string[] = [];

  for (const o of overrides) {
    const net = o.product.fromPriceCents ?? 0;
    const client = o.customFromPriceCents!;
    const v = evaluarDrift({
      supplier: o.product.supplier,
      active: o.product.active,
      clientCents: client,
      netCents: net,
    });
    if (v.kind === "no-auditable") noAuditables.push(o.product.slug);
    if (v.kind !== "aviso") continue;
    drifted.push({
      slug: o.product.slug,
      name: o.product.name,
      clientCents: client,
      netCents: net,
      ratio: Math.round(v.ratio * 100) / 100,
      belowCost: v.belowCost,
    });
  }

  drifted.sort((a, b) => a.ratio - b.ratio);

  if (drifted.length > 0) {
    const belowCost = drifted.filter((d) => d.belowCost).length;
    const lines = drifted
      .slice(0, 15)
      .map(
        (d) =>
          `${d.belowCost ? "🔴" : "🟠"} ${escapeTgHtml(d.name)} (${d.slug}): PVP ${(d.clientCents / 100).toFixed(2)}€ vs neto ${(d.netCents / 100).toFixed(2)}€ → ×${d.ratio}`,
      )
      .join("\n");
    void notifyTelegram(
      `⚠️ <b>Overrides de precio desfasados</b> (${drifted.length}${belowCost ? `, ${belowCost} BAJO COSTE` : ""})\n` +
        `El neto del proveedor se movió y el precio fijado quedó corto:\n${lines}\n` +
        `Revisar en /admin/products (editar precio o quitar el override).`,
    ).catch((e) =>
      console.error("[override-price-drift] notifyTelegram falló:", e instanceof Error ? e.message : e),
    );
  }

  return NextResponse.json({
    ok: true,
    checked: overrides.length,
    // Los no auditables NO cuentan como revisados: si algún día se carga el
    // coste real de Adivin, este número debe subir solo.
    audited: overrides.length - noAuditables.length,
    drifted: drifted.length,
    belowCost: drifted.filter((d) => d.belowCost).length,
    notAuditable: noAuditables.length,
    notAuditableReason:
      noAuditables.length > 0
        ? "fromPriceCents es PVP, no coste (proveedor sin tarifa de compra en BD)"
        : null,
    items: drifted.slice(0, 50),
  });
});
