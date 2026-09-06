/**
 * POST /api/cron/catalog-freshness-watchdog
 *
 * Vigila que el catálogo publicado siga siendo el que el proveedor sirve hoy:
 * cuenta fichas ACTIVAS de proveedores CON sync automático cuyo `syncedAt`
 * lleva más de N días sin moverse. Si el sync corre cada noche y una ficha no
 * se refresca, el feed ya no la trae — y sigue a la venta con el precio y el
 * stock del día en que se quedó atrás.
 *
 * POR QUÉ NO LO CAZABA NADA (medido el 2026-09-06, 81 fichas así en producción):
 * los watchdogs que ya había vigilan la EJECUCIÓN (que el cron corra, que no
 * muera a mitad) y esos syncs terminan en verde. La señal no está en la
 * ejecución sino en el dato que se quedó sin tocar, y eso no lo miraba nadie.
 *
 * El corte automático/manual se lee de `Supplier.hasAutoSync`, no de una lista
 * escrita aquí: un proveedor sin API cuyo catálogo se carga a mano no es un
 * fallo, y si algún día pasa a automático la vigilancia se entera sola.
 *
 * NO ARREGLA NADA: desactivar una ficha o revisar su precio es decisión
 * comercial. Esto cuenta, agrupa, deja una muestra y avisa.
 *
 * Anti-spam: solo en flanco de subida, como `tariff-coverage-watchdog` y
 * `supplier-ref-en-descripcion`. Un problema que ya estaba ayer no vuelve a
 * despertar a nadie.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { clasificarFrescura } from "@/lib/catalog-freshness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_KEY = "catalog_freshness_ultimo";

/** Cuántos slugs se devuelven: esto avisa, no inventaria. */
const MUESTRA = 20;

/**
 * Días sin refrescar. Los syncs corren a diario, así que 7 tolera de sobra la
 * noche que falla (~5 % de ellas) sin dejar pasar un abandono real.
 */
function getDias(): number {
  const n = parseInt(process.env.CATALOG_FRESHNESS_DAYS ?? "7", 10);
  return Number.isFinite(n) && n >= 1 ? n : 7;
}

/**
 * Umbral de aviso. Por debajo es goteo normal (una referencia retirada aquí y
 * allá); por encima es un feed que ha dejado atrás un bloque de catálogo.
 */
function getUmbral(): number {
  const n = parseInt(process.env.CATALOG_FRESHNESS_THRESHOLD ?? "25", 10);
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

export const POST = wrapCronHandler("catalog-freshness-watchdog", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const diasUmbral = getDias();
  const umbral = getUmbral();

  const [productos, proveedores] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { slug: true, supplier: true, syncedAt: true },
    }),
    prisma.supplier.findMany({ select: { code: true, hasAutoSync: true } }),
  ]);

  const frescura = clasificarFrescura({
    productos: productos.map((p) => ({ slug: p.slug, supplier: String(p.supplier), syncedAt: p.syncedAt })),
    proveedores: proveedores.map((s) => ({ code: String(s.code), hasAutoSync: s.hasAutoSync })),
    ahora: new Date(),
    diasUmbral,
  });

  let previo: number | null = null;
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: STATE_KEY }, select: { value: true } });
    if (typeof row?.value === "number") previo = row.value;
  } catch {
    // Sin estado previo se trata como primera vez: el flanco decide abajo.
  }

  const avisar = frescura.total > umbral && (previo === null || previo <= umbral);

  if (avisar) {
    const detalle = Object.entries(frescura.porProveedor)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s}: ${n}`)
      .join(" · ");
    const masVieja = frescura.obsoletas[0];
    await notifyAdmins({
      title: `⚠️ ${frescura.total} fichas activas que el sync ya no refresca`,
      body:
        `Llevan más de ${diasUmbral} días sin actualizarse y siguen a la venta con el precio y el stock de entonces. ` +
        `${detalle}. La más antigua: ${masVieja?.dias ?? "?"} días. Umbral ${umbral}. ` +
        `Suele ser catálogo que el proveedor retiró de su feed y aquí quedó publicado.`,
      url: "/admin/insights",
      tag: "catalog-freshness-watchdog",
    });
  }

  await prisma.adminSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: frescura.total as unknown as object },
    update: { value: frescura.total as unknown as object },
  });

  return NextResponse.json({
    ok: true,
    revisadas: productos.length,
    obsoletas: frescura.total,
    porProveedor: frescura.porProveedor,
    manualesAntiguas: frescura.manualesAntiguas,
    proveedoresNoDeclarados: frescura.proveedoresNoDeclarados,
    diasUmbral,
    umbral,
    previo,
    avisado: avisar,
    muestra: frescura.obsoletas.slice(0, MUESTRA).map((o) => ({ slug: o.slug, supplier: o.supplier, dias: o.dias })),
  });
});

// GET para disparo manual con el mismo secret.
export const GET = POST;
