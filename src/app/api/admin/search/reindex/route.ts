import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { meiliEnabled, reindexAllProducts } from "@/lib/search/meili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El reindex completo (~9.5k docs, swap atómico) tarda segundos, pero el
// default de 30s se queda corto si la BD está cargada.
export const maxDuration = 120;

/**
 * POST /api/admin/search/reindex — reconstruye el índice de Meilisearch.
 * También se dispara automáticamente al final de cada sync de proveedor;
 * esto es el botón manual (tras editar precios/productos a mano, p. ej.).
 */
export async function POST(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  if (!meiliEnabled())
    return NextResponse.json({ error: "Meilisearch no configurado (MEILI_MASTER_KEY)" }, { status: 503 });

  try {
    const started = Date.now();
    const { indexed } = await reindexAllProducts();
    return NextResponse.json({ ok: true, indexed, ms: Date.now() - started });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[search-reindex]", msg);
    return NextResponse.json({ error: `Reindex falló: ${msg}` }, { status: 502 });
  }
}
