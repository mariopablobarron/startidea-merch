/**
 * POST /api/cron/tariff-coverage-watchdog
 *
 * Vigila que el catálogo siga "cotizable": cuenta productos ACTIVOS que tienen
 * técnica de marcaje asignada pero NINGUNA con tarifa (scales). Esos productos
 * muestran "Técnica sin tarifa registrada — pedir cotización manual" en la web.
 *
 * Contexto: el 2026-06-15 detectamos 3.369 productos Makito así (desajuste de
 * códigos de técnica entre sync de tarifa y enrich). Pasó SEMANAS sin que nadie
 * lo notara hasta verlo en la web. Este watchdog convierte ese silencio en una
 * alerta: si la cuenta supera el umbral, avisa a admins (push + Slack).
 *
 * Anti-spam: solo alerta en flanco de subida (hoy supera umbral, ayer no),
 * guardando el último valor en AdminSetting. Un problema persistente no
 * machaca con alertas diarias.
 *
 * Umbral: env TARIFF_BLOCKED_THRESHOLD (default 50) — tolera el goteo normal de
 * productos nuevos aún sin tarifa entre syncs, pero detecta regresiones grandes.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_KEY = "tariff_watchdog_last_blocked";

function getThreshold(): number {
  const n = parseInt(process.env.TARIFF_BLOCKED_THRESHOLD ?? "50", 10);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

const SUPPLIERS = ["midocean", "makito", "cifra", "adivin"] as const;

export const POST = wrapCronHandler("tariff-coverage-watchdog", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Producto bloqueado = activo, con técnica asignada, pero ninguna con tarifa.
  const blockedWhere = {
    active: true,
    positions: { some: { techniques: { some: {} } } },
    NOT: { positions: { some: { techniques: { some: { technique: { scales: { some: {} } } } } } } },
  };

  const bySupplier: Record<string, number> = {};
  let totalBlocked = 0;
  for (const s of SUPPLIERS) {
    const n = await prisma.product.count({ where: { ...blockedWhere, supplier: s } });
    bySupplier[s] = n;
    totalBlocked += n;
  }

  const threshold = getThreshold();

  // Valor anterior (flanco de subida)
  let prev = 0;
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: STATE_KEY }, select: { value: true } });
    if (typeof row?.value === "number") prev = row.value;
  } catch {
    // ignore
  }

  const shouldNotify = totalBlocked > threshold && prev <= threshold;

  if (shouldNotify) {
    const detail = SUPPLIERS.filter((s) => bySupplier[s] > 0)
      .map((s) => `${s}: ${bySupplier[s]}`)
      .join(" · ");
    await notifyAdmins({
      title: `⚠️ ${totalBlocked} productos sin tarifa de marcaje`,
      body: `Productos activos con técnica pero sin tarifa → muestran "pedir cotización manual". ${detail}. Umbral ${threshold}. Suele ser un sync de tarifa que falló o un desajuste de códigos de técnica.`,
      url: "/admin/insights",
      tag: "tariff-coverage-watchdog",
    });
  }

  // Guardar estado actual para el flanco del próximo run
  await prisma.adminSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: totalBlocked as unknown as object },
    update: { value: totalBlocked as unknown as object },
  });

  return NextResponse.json({
    ok: true,
    totalBlocked,
    bySupplier,
    threshold,
    prev,
    notified: shouldNotify,
    note: shouldNotify
      ? "Alerta enviada (flanco de subida)"
      : totalBlocked > threshold
        ? "Sigue por encima del umbral pero ya estaba ayer (anti-spam)"
        : "Dentro de umbral, catálogo sano",
  });
});

// GET para debug manual (mismo handler, mismo secret check)
export const GET = POST;
