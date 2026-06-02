/**
 * GET /api/admin/insights/export-pdf
 *
 * Genera PDF ejecutivo con el snapshot actual del dashboard.
 * Útil para enviar a inversores o imprimir como informe mensual.
 */
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { isAdmin } from "@/lib/admin-session";
import {
  getCatalogHealth,
  getConversionFunnel,
  getSuggestions,
  getTopViewedProducts,
  getSupplierStatuses,
} from "@/lib/insights";
import { DashboardReport } from "@/lib/insights/dashboard-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPLIER_LABEL: Record<string, string> = {
  midocean: "MidOcean",
  makito: "Makito",
  cifra: "Cifra",
};

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const [health, funnel, suggestions, top, suppliers] = await Promise.all([
    getCatalogHealth(),
    getConversionFunnel(),
    getSuggestions(),
    getTopViewedProducts(5, "30d"),
    getSupplierStatuses(),
  ]);

  const data = {
    date: new Date(),
    health: {
      activeProducts: health.activeProducts,
      totalVariants: health.totalVariants,
      pctStock: health.pctStock,
      pctImage: health.pctImage,
    },
    funnel: {
      views30d: funnel.views30d,
      cartAdds30d: funnel.cartAdds30d,
      recommenderQueries30d: funnel.recommenderQueries30d,
      proposals30d: funnel.proposals30d,
      cartConvPct: funnel.cartConvPct,
      proposalConvPct: funnel.proposalConvPct,
      proposals30dDelta: funnel.proposals30dDelta,
    },
    suggestions: suggestions.map((s) => ({
      id: s.id,
      severity: s.severity,
      title: s.title,
      body: s.body,
    })),
    topProducts: top.map((p) => ({
      name: p.name,
      view30d: p.view30d,
      cartAddCount: p.cartAddCount,
      proposalCount: p.proposalCount,
    })),
    suppliers: suppliers.map((s) => ({
      supplier: SUPPLIER_LABEL[s.supplier] ?? s.supplier,
      products: s.products,
      pctStock: s.pctStock,
    })),
  };

  const pdfBuffer = await renderToBuffer(
    createElement(DashboardReport, { data }) as unknown as ReactElement<DocumentProps>,
  );

  const filename = `todomerch-insights-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
