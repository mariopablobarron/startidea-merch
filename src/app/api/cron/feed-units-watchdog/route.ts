/**
 * POST /api/cron/feed-units-watchdog
 *
 * Vigila que no vuelva el ÷1.000 del feed.
 *
 * Contexto: el catálogo entero sirvió durante semanas el stock dividido por
 * mil y las áreas de marcaje divididas por diez —«90 uds» donde el proveedor
 * tenía 90.000, «15 × 7 mm» donde son 150 × 70—. Se arregló el parser y se
 * escribió `scripts/audit-feed-units.ts` para comprobar el resultado en la
 * base de datos… pero ese script solo corre cuando un humano lo teclea, y para
 * teclearlo hace falta entrar por SSH al VPS. Es decir: la comprobación existía
 * y en la práctica no se hacía nunca. Esto la hace sola.
 *
 * Un sync de proveedor puede reintroducir el fallo en cualquier momento sin
 * que nadie lo note: el número raro se ve en la ficha, no en un log.
 *
 * Anti-spam: solo avisa en flanco de subida (hoy hay hallazgos y en la última
 * pasada había igual o menos), guardando el recuento anterior en AdminSetting.
 * Un problema persistente no machaca con alertas diarias — pero seguir por
 * encima queda dicho en la respuesta.
 *
 * La respuesta lleva el detalle completo a propósito: la acción `cron-trigger`
 * imprime el cuerpo en el log de Actions, así que el informe queda ahí sin que
 * nadie tenga que abrir una consola contra producción.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { auditarUnidadesFeed } from "@/lib/auditoria-unidades-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_KEY = "feed_units_watchdog_last_total";

export const POST = wrapCronHandler("feed-units-watchdog", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const auditoria = await auditarUnidadesFeed(prisma);
  const total = auditoria.hallazgos.total;

  // Recuento de la pasada anterior, para el flanco.
  let prev = 0;
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: STATE_KEY },
      select: { value: true },
    });
    if (typeof row?.value === "number") prev = row.value;
  } catch {
    // Sin estado previo se trata como 0: el primer hallazgo avisa.
  }

  // Umbral cero: aquí no hay goteo normal que tolerar. Un solo valor con la
  // escala rota es un fallo de conversión, no ruido.
  const shouldNotify = total > 0 && prev <= 0;

  if (shouldNotify) {
    const h = auditoria.hallazgos;
    const detalle = [
      h.stockImplausible > 0 ? `${h.stockImplausible} con stock de 1 a ${auditoria.umbrales.stockMinimoPlausible - 1} uds` : null,
      h.areaMarcajeImplausible > 0 ? `${h.areaMarcajeImplausible} áreas por debajo de ${auditoria.umbrales.areaMinimaMm} mm` : null,
      h.tramosImplausibles > 0 ? `${h.tramosImplausibles} tramos que arrancan entre 2 y 9` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    await notifyAdmins({
      title: `⚠️ ${total} valores con la escala del feed rota`,
      body: `${detalle}. Es la firma del ÷1.000: el feed europeo usa el punto como separador de millares y algo ha vuelto a leerlo como decimal, o las áreas de marcaje vuelven a guardarse en cm dentro de un campo en mm. Mirar el último sync de proveedor.`,
      url: "/admin/suppliers",
      tag: "feed-units-watchdog",
    });
  }

  await prisma.adminSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: total as unknown as object },
    update: { value: total as unknown as object },
  });

  return NextResponse.json({
    ok: true,
    ...auditoria,
    prev,
    notified: shouldNotify,
    note:
      total === 0
        ? "Nada sospechoso: la escala del feed está sana."
        : shouldNotify
          ? "Alerta enviada (flanco de subida)."
          : "Sigue habiendo hallazgos, pero ya los había en la pasada anterior (anti-spam).",
  });
});

// GET para depurar a mano: mismo handler y mismo secret.
export const GET = POST;
