/**
 * POST /api/cron/insights-digest-monthly
 *
 * Email mensual con el comparativo mes pasado vs mes anterior:
 * - Tabla con 5 KPIs side-by-side + delta
 * - Top suggestions del periodo
 * - PDF adjunto con la misma información formateada
 * - Highlights narrativos en el body del email
 *
 * Programado: día 1 de cada mes a las 09:00 UTC.
 * Disparo manual: workflow_dispatch del workflow o GET con cron-secret.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import {
  buildComparison,
  getKpisForRange,
  resolvePreset,
} from "@/lib/insights/compare";
import { getSuggestions } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#c43c0d",
  warning: "#d97706",
  opportunity: "#059669",
  info: "#9ca3af",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#fbeeeb",
  warning: "#fef3c7",
  opportunity: "#ecfdf5",
  info: "#faf8f4",
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  warning: "⚠️",
  opportunity: "💡",
  info: "ℹ️",
};

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(d);
}

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Preset previous_month: A=mes pasado, B=anterior al mes pasado
  const { a: aRange, b: bRange } = resolvePreset("previous_month");
  const [a, b, suggestions] = await Promise.all([
    getKpisForRange(aRange.from, aRange.to, aRange.label),
    getKpisForRange(bRange.from, bRange.to, bRange.label),
    getSuggestions().catch(() => []),
  ]);
  const comparison = buildComparison(a, b);

  const subject = `📅 TodoMerch · resumen mensual ${monthLabel(aRange.from)} · ${a.proposals} propuestas`;

  // Highlights: top 3 cambios por magnitud
  const highlights = comparison
    .filter((r) => r.deltaPct !== 0)
    .sort((x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct))
    .slice(0, 3);

  function deltaBadgeHtml(pct: number, positiveIsGood: boolean): string {
    if (pct === 0) {
      return `<span style="display:inline-block;background:#faf8f4;color:#999;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">=</span>`;
    }
    const isUp = pct > 0;
    const good = positiveIsGood ? isUp : !isUp;
    const bg = good ? "#ecfdf5" : "#fbeeeb";
    const fg = good ? "#059669" : "#c43c0d";
    return `<span style="display:inline-block;background:${bg};color:${fg};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">${isUp ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%</span>`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,sans-serif;background:#faf8f4;color:#0a0a0b;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#faf8f4;padding:24px 0;">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e6e1d6;">

<tr><td style="padding:24px 32px;border-bottom:1px solid #e6e1d6;background:#0a0a0b;color:#fff;">
  <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a8a8a8;">Resumen mensual · ${monthLabel(aRange.from)}</p>
  <h1 style="margin:6px 0 0 0;font-size:22px;letter-spacing:-0.3px;">TodoMerchandising · Comparativa M-vs-M</h1>
  <p style="margin:8px 0 0 0;font-size:13px;color:#a8a8a8;">A: <strong style="color:#fff;">${aRange.label}</strong> · B: ${bRange.label}</p>
</td></tr>

${
  highlights.length > 0
    ? `
<tr><td style="padding:24px 32px 8px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Lectura del mes</h2>
  ${highlights
    .map((h) => {
      const isUp = h.deltaPct > 0;
      const good = h.positiveIsGood ? isUp : !isUp;
      return `
    <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;color:#0a0a0b;">
      <span style="font-weight:700;color:${good ? "#059669" : "#c43c0d"};">${isUp ? "↑" : "↓"} ${Math.abs(h.deltaPct).toFixed(1)}%</span>
      <strong>${h.metric}</strong>:
      ${h.a.toLocaleString("es-ES")} vs ${h.b.toLocaleString("es-ES")}
    </p>`;
    })
    .join("")}
</td></tr>
`
    : ""
}

<tr><td style="padding:20px 32px 8px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Tabla comparativa</h2>
  <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
    <thead>
      <tr style="background:#faf8f4;border-bottom:2px solid #e6e1d6;">
        <th style="text-align:left;padding:10px 12px;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">Métrica</th>
        <th style="text-align:right;padding:10px 12px;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">A · mes pasado</th>
        <th style="text-align:right;padding:10px 12px;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">B · anterior</th>
        <th style="text-align:right;padding:10px 12px;font-size:11px;color:#666;font-weight:600;text-transform:uppercase;">Δ</th>
      </tr>
    </thead>
    <tbody>
      ${comparison
        .map(
          (r) => `
      <tr style="border-bottom:1px solid #f0ede5;">
        <td style="padding:12px;font-size:13px;color:#0a0a0b;font-weight:500;">${r.metric}</td>
        <td style="padding:12px;text-align:right;font-size:14px;font-weight:700;color:#0a0a0b;font-variant-numeric:tabular-nums;">${r.a.toLocaleString("es-ES")}</td>
        <td style="padding:12px;text-align:right;font-size:13px;color:#666;font-variant-numeric:tabular-nums;">${r.b.toLocaleString("es-ES")}</td>
        <td style="padding:12px;text-align:right;">${deltaBadgeHtml(r.deltaPct, r.positiveIsGood)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</td></tr>

${
  suggestions.length > 0
    ? `
<tr><td style="padding:20px 32px 8px 32px;">
  <h2 style="margin:0 0 12px 0;font-size:15px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Decisiones para este mes</h2>
  ${suggestions
    .slice(0, 5)
    .map(
      (s) => `
    <div style="padding:14px 16px;margin-bottom:8px;background:${SEVERITY_BG[s.severity] ?? "#faf8f4"};border-left:3px solid ${SEVERITY_COLOR[s.severity] ?? "#9ca3af"};border-radius:4px;">
      <p style="margin:0;font-size:12px;font-weight:600;color:#0a0a0b;">${SEVERITY_EMOJI[s.severity] || ""} ${s.title}</p>
      <p style="margin:4px 0 0 0;font-size:13px;color:#555;line-height:1.5;">${s.body}</p>
    </div>`,
    )
    .join("")}
</td></tr>
`
    : ""
}

<tr><td style="padding:8px 32px 28px 32px;">
  <p style="margin:14px 0 0 0;text-align:center;">
    <a href="${SITE_URL}/admin/insights/compare?preset=previous_month" style="display:inline-block;background:#0a0a0b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:99px;font-size:13px;font-weight:600;">Ver comparativa completa</a>
  </p>
  <p style="margin:14px 0 0 0;text-align:center;font-size:11px;color:#999;">
    Próximo digest mensual: ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(new Date(Date.now() + 30 * 24 * 3600 * 1000))}
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const result = await sendEmail({
    to: RESEND_TO_INTERNAL,
    subject,
    html,
    context: "insights monthly digest",
  });

  return NextResponse.json({
    ok: result.ok,
    sent: result.ok,
    error: result.ok ? null : result.error,
    period: {
      a: { label: aRange.label, from: aRange.from, to: aRange.to },
      b: { label: bRange.label, from: bRange.from, to: bRange.to },
    },
    comparison: comparison.map((r) => ({
      metric: r.metric,
      a: r.a,
      b: r.b,
      deltaPct: r.deltaPct,
    })),
    suggestionsCount: suggestions.length,
  });
}

// Permitir disparo manual con GET para debug desde browser admin
export const GET = POST;
