/**
 * GET /api/admin/insights/export?type=...
 *
 * Exporta datos del dashboard a CSV para abrir en Excel/Numbers.
 *
 * Tipos:
 *   - top-products       → ranking productos 30d (slug, name, ref, supplier, views, cart, prop)
 *   - search-queries     → queries del navbar últimos 30d
 *   - search-no-results  → queries sin resultados últimos 30d
 *   - categories         → categorías por engagement 30d
 *   - overpriced         → productos con precio anómalo
 *   - suppliers          → estado por proveedor (stock, sync)
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  getTopViewedProducts,
  getTopSearchQueries,
  getSearchQueriesNoResults,
  getTopCategories,
  getOverpricedProducts,
  getSupplierStatuses,
} from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(s: string | number | null | undefined): string {
  const str = s == null ? "" : String(s);
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(";")];
  for (const r of rows) lines.push(r.map(csvEscape).join(";"));
  // BOM + CRLF — Excel ES detecta UTF-8 automáticamente
  return "﻿" + lines.join("\r\n");
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString();
}

const EUR = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const type = new URL(req.url).searchParams.get("type") || "top-products";
  let csv = "";
  let filename = `insights-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

  switch (type) {
    case "top-products": {
      const data = await getTopViewedProducts(500, "30d");
      csv = rowsToCsv(
        ["Slug", "Producto", "Ref interna", "Proveedor", "Views 30d", "Carrito total", "Propuestas total", "Tiene imagen", "Última visita"],
        data.map((p) => [
          p.slug,
          p.name,
          p.internalRef ?? "",
          p.supplier,
          p.view30d,
          p.cartAddCount,
          p.proposalCount,
          p.primaryImageUrl ? "Sí" : "No",
          fmtDate(p.lastViewedAt),
        ]),
      );
      break;
    }
    case "search-queries": {
      const data = await getTopSearchQueries(500, "30d");
      csv = rowsToCsv(
        ["Query", "Hits 30d", "Resultados media"],
        data.map((s) => [s.query, s.count, s.resultsAvg.toFixed(1)]),
      );
      break;
    }
    case "search-no-results": {
      const data = await getSearchQueriesNoResults(500, "30d");
      csv = rowsToCsv(
        ["Query", "Hits 30d (sin resultados)"],
        data.map((s) => [s.query, s.count]),
      );
      break;
    }
    case "categories": {
      const data = await getTopCategories(200);
      csv = rowsToCsv(
        ["Categoría", "Productos", "Views 30d", "Carritos 30d", "% Conv"],
        data.map((c) => [
          c.categoryName,
          c.products,
          c.views30d,
          c.cartAdds30d,
          c.views30d > 0 ? ((c.cartAdds30d / c.views30d) * 100).toFixed(1) : "0",
        ]),
      );
      break;
    }
    case "overpriced": {
      const data = await getOverpricedProducts(100);
      csv = rowsToCsv(
        ["Producto", "Categoría", "Mín. producto EUR", "Mediana categoría EUR", "Multiplicador"],
        data.map((p) => [
          p.name,
          p.category,
          EUR(p.minPriceCents),
          EUR(p.categoryMedianCents),
          p.multiple,
        ]),
      );
      break;
    }
    case "suppliers": {
      const data = await getSupplierStatuses();
      csv = rowsToCsv(
        ["Proveedor", "Productos", "Activos", "Variantes", "Con stock", "% Stock", "Última sync stock", "Horas desde sync"],
        data.map((s) => [
          s.supplier,
          s.products,
          s.activeProducts,
          s.variants,
          s.variantsWithStock,
          s.pctStock,
          fmtDate(s.lastStockUpdate),
          s.hoursStaleStock ?? "",
        ]),
      );
      break;
    }
    default:
      return NextResponse.json({ error: "UNKNOWN_TYPE" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
