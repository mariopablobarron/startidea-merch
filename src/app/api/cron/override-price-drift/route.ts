import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { notifyTelegram } from "@/lib/telegram";

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
 *   - < 1.3  → aviso: margen implícito bajo el 30% (el global es 1,6×).
 * Solo avisa (Telegram + respuesta JSON); no toca precios — decisión humana.
 *
 * Llamar 1x/semana:  POST /api/cron/override-price-drift  (X-Cron-Secret)
 */
const WARN_RATIO = 1.3;

export const POST = wrapCronHandler("override-price-drift", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const overrides = await prisma.productOverride.findMany({
    where: { customFromPriceCents: { not: null } },
    select: {
      customFromPriceCents: true,
      product: {
        select: { slug: true, name: true, fromPriceCents: true, active: true },
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

  for (const o of overrides) {
    const net = o.product.fromPriceCents ?? 0;
    const client = o.customFromPriceCents!;
    if (!o.product.active || net <= 0 || client <= 0) continue; // sin neto fiable, no opinamos
    const ratio = client / net;
    if (ratio < WARN_RATIO) {
      drifted.push({
        slug: o.product.slug,
        name: o.product.name,
        clientCents: client,
        netCents: net,
        ratio: Math.round(ratio * 100) / 100,
        belowCost: ratio < 1,
      });
    }
  }

  drifted.sort((a, b) => a.ratio - b.ratio);

  if (drifted.length > 0) {
    const belowCost = drifted.filter((d) => d.belowCost).length;
    const lines = drifted
      .slice(0, 15)
      .map(
        (d) =>
          `${d.belowCost ? "🔴" : "🟠"} ${d.name} (${d.slug}): PVP ${(d.clientCents / 100).toFixed(2)}€ vs neto ${(d.netCents / 100).toFixed(2)}€ → ×${d.ratio}`,
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
    drifted: drifted.length,
    belowCost: drifted.filter((d) => d.belowCost).length,
    items: drifted.slice(0, 50),
  });
});
