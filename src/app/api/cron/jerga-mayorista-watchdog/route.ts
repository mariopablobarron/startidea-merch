/**
 * POST /api/cron/jerga-mayorista-watchdog
 *
 * Vigila que ninguna ficha ACTIVA vuelva a publicar el argumentario mayorista
 * («para rotulistas… 30% de margen») en los cinco campos de texto que acaban
 * delante del cliente. Es el barrido de `src/lib/audit-jerga-mayorista.ts`
 * —el mismo que corre a mano con `npm run scripts:audit-jerga`— colgado de un
 * cron, que era la TAREA Nº11 del backlog.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN GITHUB ACTIONS: necesita el `DATABASE_URL` de
 * producción. Y por qué diario y no mensual, como se anotó al principio: esta
 * fuga ha reaparecido CINCO veces por puertas distintas, así que un mes de
 * ventana es demasiado; el coste es la misma consulta que ya hace su vecina
 * `supplier-ref-en-descripcion` sobre las mismas fichas activas.
 *
 * EL VEREDICTO LO DA EL SANEADOR REAL (`supplierJargonHits`, vía la lib), no
 * una copia del patrón: un detector duplicado es exactamente cómo divergieron
 * los dos escaneos anti-fuga el 13-ago.
 *
 * NO ARREGLA NADA. Reescribir el texto de fichas vivas es decisión de Mario, y
 * en el caso de las 59 filas sucias de Ádivin limpiarlas en origen exigiría
 * reimportar el feed, que toca precios. Esto cuenta, avisa y deja los slugs.
 *
 * ⚠️ LO QUE NO SALE EN LA RESPUESTA: ni el extracto ni las palabras detectadas.
 * El JSON lo imprime `merch-cron-runner.sh` en `/var/log/merch-crons.log` y el
 * aviso va a Telegram; volcar ahí el argumentario sería sacarlo por otra
 * puerta. Para ver el detalle está el script, que corre contra la BD.
 *
 * Anti-spam: avisa solo en flanco de subida, como `tariff-coverage-watchdog` y
 * `supplier-ref-en-descripcion`. Un problema que ya estaba ayer no vuelve a
 * despertar a nadie.
 *
 * Ver [[rule_no_supplier_exposure]] e [[incident_merch_fuga_mayorista_20260907]].
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { barrerJergaMayorista, type FichaTexto } from "@/lib/audit-jerga-mayorista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_KEY = "jerga_mayorista_ultimo";

/** Cuántos slugs se devuelven: esto avisa, no inventaria. */
const MUESTRA = 20;

export const POST = wrapCronHandler("jerga-mayorista-watchdog", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const fichas = (await prisma.product.findMany({
    where: { active: true },
    select: {
      slug: true,
      name: true,
      shortDescription: true,
      longDescription: true,
      enhancedShortDescription: true,
      material: true,
    },
  })) as FichaTexto[];

  const r = barrerJergaMayorista(fichas);
  const afectadas = r.slugsSucios.length;

  let previo: number | null = null;
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: STATE_KEY }, select: { value: true } });
    if (typeof row?.value === "number") previo = row.value;
  } catch {
    // Sin estado previo se trata como primera medición: avisa si hay algo.
  }

  const avisar = afectadas > 0 && (previo === null || afectadas > previo);

  if (avisar) {
    await notifyAdmins({
      title: `🔒 ${afectadas} fichas publican argumentario mayorista`,
      body:
        `El barrido por descubrimiento encuentra ${afectadas} fichas activas cuyo texto público pasa por ` +
        `argumentario de venta a distribuidores (${r.sucios.length} campos de ${r.camposRevisados} revisados). ` +
        `Regla nº2. El detalle, con «npm run scripts:audit-jerga» contra la BD. ` +
        `Tras arreglarlo hay que reindexar a mano: POST /api/cron/search-reindex.`,
      url: "/admin/products",
      tag: "jerga-mayorista-watchdog",
    });
  }

  await prisma.adminSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: afectadas as unknown as object },
    update: { value: afectadas as unknown as object },
  });

  return NextResponse.json({
    ok: true,
    fichas: r.fichas,
    camposRevisados: r.camposRevisados,
    // El ancla NO filtra: este par de cifras es lo que permite decir «he mirado
    // todas», no «todas las que ya conocía».
    camposConAncla: r.camposConAncla,
    camposLimpiosConAncla: r.camposLimpiosConAncla,
    afectadas,
    camposSucios: r.sucios.length,
    previo,
    avisado: avisar,
    // Solo slug y campo: el texto detectado se queda fuera a propósito.
    muestra: r.sucios.slice(0, MUESTRA).map((h) => ({ slug: h.slug, campo: h.campo })),
    nota: avisar
      ? "Aviso enviado (flanco de subida)"
      : afectadas > 0
        ? "Sigue habiendo fichas sucias, pero no más que en el último recuento (anti-spam)"
        : "Ninguna ficha activa publica argumentario mayorista",
  });
});

// GET para comprobarlo a mano, con el mismo cerrojo.
export const GET = POST;
