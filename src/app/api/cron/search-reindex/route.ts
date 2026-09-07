/**
 * POST /api/cron/search-reindex
 *
 * Reconstruye el índice de Meilisearch a partir de la BD.
 *
 * Por qué existe: el índice guarda una COPIA del texto de cada ficha, así que
 * un saneador nuevo en la indexación no reescribe lo ya indexado. El 07-sep-2026
 * eso se midió: horas después de cerrar la fuga del argumentario mayorista
 * (`bf3145f`), buscar «rotulista» en el buscador público seguía devolviendo
 * justo las fichas afectadas — el HTML ya salía limpio, pero el índice no.
 *
 * Hasta hoy solo había dos vías de reindexar: el botón del panel (sesión admin)
 * o el final de un sync de proveedor. La segunda toca precios, así que no vale
 * como herramienta de operación. Esta es la tercera: reindexar y nada más.
 *
 * No está programado en el crontab a propósito — el reindex completo (~9,5k
 * docs) carga la BD, y los syncs ya lo disparan cada noche. Esto es el botón
 * de emergencia para tirarlo a mano cuando cambia cómo se construye el
 * documento indexado.
 *
 * El lock evita que dos reindexados se pisen si alguien lo llama dos veces.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { meiliEnabled, reindexAllProducts } from "@/lib/search/meili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El swap atómico tarda segundos, pero con la BD cargada se va de los 30s.
export const maxDuration = 120;

export const POST = wrapCronHandler("search-reindex", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!meiliEnabled()) {
    return NextResponse.json({ error: "Meilisearch no configurado (MEILI_MASTER_KEY)" }, { status: 503 });
  }

  // withCronLock está tipado como Response; el wrapper de telemetría pide
  // NextResponse. Todos los retornos de dentro lo son.
  return (await withCronLock("search-reindex", async () => {
    const started = Date.now();
    try {
      const { indexed } = await reindexAllProducts();
      return NextResponse.json({ ok: true, indexed, ms: Date.now() - started });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cron search-reindex]", msg);
      return NextResponse.json({ ok: false, error: `Reindex falló: ${msg}` }, { status: 502 });
    }
  })) as NextResponse;
});
