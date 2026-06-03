/**
 * POST /api/admin/suppliers/cifra/diagnose
 *
 * Descarga catálogo entero y reporta: total productos, % con stock,
 * % con precio, muestra de 5. Útil para confirmar el bug conocido
 * de "stock 0% en producción" — si todos vienen con quantity=0,
 * el problema está aguas arriba.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { diagnoseProducts } from "@/lib/suppliers/cifra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const result = await diagnoseProducts(5);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message },
      { status: 502 },
    );
  }
  // No exponer todo el sample crudo (puede llevar datos sensibles del
  // proveedor) — sólo los campos necesarios para diagnóstico.
  const sample = result.sample.map((p) => ({
    model: p.model,
    rootmodel: p.rootmodel,
    name: p.name,
    quantity: p.quantity,
    price_pvp: p.price_pvp,
  }));
  return NextResponse.json({
    ok: true,
    totalCount: result.totalCount,
    pctStock:
      result.totalCount > 0
        ? Math.round((result.withStock / result.totalCount) * 1000) / 10
        : 0,
    pctZeroStock:
      result.totalCount > 0
        ? Math.round((result.withZeroStock / result.totalCount) * 1000) / 10
        : 0,
    pctPrice:
      result.totalCount > 0
        ? Math.round((result.withPrice / result.totalCount) * 1000) / 10
        : 0,
    sample,
  });
}
