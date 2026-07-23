/**
 * POST /api/cron/insights-digest
 *
 * Email semanal a admin con el resumen de /admin/insights:
 * - KPIs salud catálogo
 * - Funnel conversión 30d
 * - Top 5 sugerencias
 * - Top 5 productos visualizados
 * - Top 5 búsquedas + queries sin resultados
 *
 * Programado: lunes 08:00 UTC (workflow GitHub Actions).
 */
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { requireCronSecret } from "@/lib/auth";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import {
  getCatalogHealth,
  getConversionFunnel,
  getSuggestions,
  getTopViewedProducts,
  getTopSearchQueries,
  getSearchQueriesNoResults,
  getSupplierStatuses,
} from "@/lib/insights";
import { DashboardReport } from "@/lib/insights/dashboard-pdf";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  warning: "⚠️",
  opportunity: "💡",
  info: "ℹ️",
};

export const POST = wrapCronHandler("insights-digest", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [health, funnel, suggestions, top, topSearches, noResults, suppliers] = await Promise.all([
    getCatalogHealth(),
    getConversionFunnel(),
    getSuggestions(),
    getTopViewedProducts(5, "30d"),
    getTopSearchQueries(5, "7d").catch(() => []),
    getSearchQueriesNoResults(5, "7d").catch(() => []),
    getSupplierStatuses().catch(() => []),
  ]);

  // Generar PDF para adjuntar
  let pdfBuffer: Buffer | null = null;
  try {
    const SUPPLIER_LABEL: Record<string, string> = {
      midocean: "MidOcean",
      makito: "Makito",
      cifra: "Cifra",
    };
    pdfBuffer = await renderToBuffer(
      createElement(DashboardReport, {
        data: {
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
            id: s.id, severity: s.severity, title: s.title, body: s.body,
          })),
          topProducts: top.map((p) => ({
            name: p.name, view30d: p.view30d,
            cartAddCount: p.cartAddCount, proposalCount: p.proposalCount,
          })),
          suppliers: suppliers.map((s) => ({
            supplier: SUPPLIER_LABEL[s.supplier] ?? s.supplier,
            products: s.products,
            pctStock: s.pctStock,
          })),
        },
      }) as unknown as ReactElement<DocumentProps>,
    );
  } catch (e) {
    console.error("[digest] PDF render failed:", e);
  }

  const week = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
  }).format(new Date());

  const subject = `📊 TodoMerch · resumen ${week} · ${funnel.proposals30d} propuestas / ${funnel.views30d} views`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#faf8f4;color:#0a0a0b;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#faf8f4;padding:24px 0;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e6e1d6;">

<tr><td style="padding:24px 32px;border-bottom:1px solid #e6e1d6;background:#0a0a0b;color:#fff;">
  <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a8a8a8;">Resumen semanal · ${week}</p>
  <h1 style="margin:6px 0 0 0;font-size:22px;letter-spacing:-0.3px;">TodoMerchandising · Insights</h1>
</td></tr>

<tr><td style="padding:28px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Conversión 30 días</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border-spacing:0;">
    <tr>
      <td style="padding:12px;background:#faf8f4;border-radius:8px;border:1px solid #e6e1d6;">
        <p style="margin:0;font-size:11px;color:#666;text-transform:uppercase;">Views</p>
        <p style="margin:4px 0 0 0;font-size:22px;font-weight:700;">${funnel.views30d.toLocaleString("es-ES")}</p>
      </td>
      <td style="width:8px;"></td>
      <td style="padding:12px;background:#faf8f4;border-radius:8px;border:1px solid #e6e1d6;">
        <p style="margin:0;font-size:11px;color:#666;text-transform:uppercase;">Cart</p>
        <p style="margin:4px 0 0 0;font-size:22px;font-weight:700;">${funnel.cartAdds30d}</p>
        <p style="margin:2px 0 0 0;font-size:10px;color:#666;">${funnel.cartConvPct}% conv</p>
      </td>
      <td style="width:8px;"></td>
      <td style="padding:12px;background:#faf8f4;border-radius:8px;border:1px solid #e6e1d6;">
        <p style="margin:0;font-size:11px;color:#666;text-transform:uppercase;">Recomendador</p>
        <p style="margin:4px 0 0 0;font-size:22px;font-weight:700;">${funnel.recommenderQueries30d}</p>
      </td>
      <td style="width:8px;"></td>
      <td style="padding:12px;background:#c43c0d;color:#fff;border-radius:8px;">
        <p style="margin:0;font-size:11px;text-transform:uppercase;opacity:0.85;">Propuestas</p>
        <p style="margin:4px 0 0 0;font-size:22px;font-weight:700;">${funnel.proposals30d}</p>
        <p style="margin:2px 0 0 0;font-size:10px;opacity:0.85;">${funnel.proposalConvPct}% conv</p>
      </td>
    </tr>
  </table>
</td></tr>

${suggestions.length > 0 ? `
<tr><td style="padding:0 32px 28px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Decisiones para esta semana</h2>
  ${suggestions.slice(0, 5).map((s) => `
    <div style="padding:14px 16px;margin-bottom:8px;background:${
      s.severity === "critical" ? "#fbeeeb" : s.severity === "warning" ? "#fef3c7" : s.severity === "opportunity" ? "#ecfdf5" : "#faf8f4"
    };border-left:3px solid ${
      s.severity === "critical" ? "#c43c0d" : s.severity === "warning" ? "#d97706" : s.severity === "opportunity" ? "#059669" : "#9ca3af"
    };border-radius:4px;">
      <p style="margin:0;font-size:12px;font-weight:600;color:#0a0a0b;">${SEVERITY_EMOJI[s.severity] || ""} ${s.title}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#555;line-height:1.5;">${s.body}</p>
    </div>
  `).join("")}
</td></tr>
` : ""}

${top.length > 0 ? `
<tr><td style="padding:0 32px 28px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Top 5 productos (30d)</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
    ${top.map((p, i) => `
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0ede5;">
        <span style="color:#999;font-size:11px;font-family:monospace;">${i + 1}.</span>
        <a href="${SITE_URL}/catalogo/${p.slug}" style="color:#0a0a0b;text-decoration:none;font-size:13px;font-weight:500;">${p.name}</a>
        ${!p.primaryImageUrl ? '<span style="margin-left:8px;padding:1px 6px;background:#fbeeeb;color:#c43c0d;border-radius:99px;font-size:10px;font-weight:600;">SIN IMAGEN</span>' : ""}
        <span style="float:right;font-size:11px;color:#666;font-family:monospace;">${p.view30d} views · ${p.cartAddCount} cart</span>
      </td></tr>
    `).join("")}
  </table>
</td></tr>
` : ""}

${(topSearches.length > 0 || noResults.length > 0) ? `
<tr><td style="padding:0 32px 28px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Búsquedas esta semana</h2>
  <table cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td style="width:48%;vertical-align:top;padding-right:12px;">
        <p style="margin:0 0 6px 0;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">Más buscadas</p>
        ${topSearches.length === 0 ? '<p style="color:#999;font-size:12px;">—</p>' : topSearches.map((s) => `
          <p style="margin:3px 0;font-size:12px;color:#0a0a0b;">${s.query} <span style="color:#999;font-size:10px;">(${s.count})</span></p>
        `).join("")}
      </td>
      <td style="width:48%;vertical-align:top;padding-left:12px;background:#fef3c7;border-radius:6px;padding:10px 12px;">
        <p style="margin:0 0 6px 0;font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase;">Sin resultados 💎</p>
        ${noResults.length === 0 ? '<p style="color:#999;font-size:12px;">—</p>' : noResults.map((s) => `
          <p style="margin:3px 0;font-size:12px;color:#0a0a0b;font-weight:500;">${s.query} <span style="color:#666;font-size:10px;">(${s.count}×)</span></p>
        `).join("")}
      </td>
    </tr>
  </table>
</td></tr>
` : ""}

<tr><td style="padding:0 32px 28px 32px;">
  <p style="margin:0;font-size:13px;color:#444;line-height:1.5;">
    Catálogo: <strong>${health.activeProducts.toLocaleString("es-ES")}</strong> productos activos ·
    <strong>${health.pctStock}%</strong> stock ·
    <strong>${health.pctImage}%</strong> con imagen
  </p>
  <p style="margin:14px 0 0 0;text-align:center;">
    <a href="${SITE_URL}/admin/insights" style="display:inline-block;background:#0a0a0b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:99px;font-size:13px;font-weight:600;">Abrir dashboard completo</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const filename = `todomerch-insights-${new Date().toISOString().slice(0, 10)}.pdf`;
  const result = await sendEmail({
    to: RESEND_TO_INTERNAL,
    subject,
    html,
    context: "insights weekly digest",
    ...(pdfBuffer
      ? { attachments: [{ filename, content: pdfBuffer }] }
      : {}),
  });

  return NextResponse.json({
    ok: result.ok,
    sent: result.ok,
    error: result.ok ? null : result.error,
    metrics: {
      views30d: funnel.views30d,
      proposals30d: funnel.proposals30d,
      suggestionsCount: suggestions.length,
    },
  });
});

// Permitir disparo manual con GET para debug desde browser admin
export const GET = POST;
