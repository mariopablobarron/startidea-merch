import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { escapeTgHtml, notifyTelegram } from "@/lib/telegram";
import { computeRoi, validateRoiInputs } from "@/lib/roi-calc";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const Schema = z.object({
  email: z.string().email().max(160),
  name: z.string().max(120).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  employees: z.number().int().positive().max(1_000_000),
  annualBudgetEur: z.number().int().positive().max(100_000_000),
  substitutionPct: z.number().int().min(0).max(100),
  sourceUrl: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  // Anti-spam: 10 cálculos/5 min por IP.
  const rl = rateLimit(req, { key: "roi-calc", max: 10, windowMs: 5 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const inputValidation = validateRoiInputs(data);
  if (inputValidation) return NextResponse.json({ error: inputValidation }, { status: 400 });

  const results = computeRoi(data);
  const created = await prisma.roiCalculation.create({
    data: {
      email: data.email,
      name: data.name ?? null,
      company: data.company ?? null,
      employees: data.employees,
      annualBudgetEur: data.annualBudgetEur,
      substitutionPct: data.substitutionPct,
      co2SavedKg: results.co2SavedKg,
      workHoursDignified: results.workHoursDignified,
      ceeProductionPct: results.ceeProductionPct,
      treesEquivalent: results.treesEquivalent,
      sourceUrl: data.sourceUrl ?? null,
    },
  });

  const firstName = (data.name || data.email).split(" ")[0];
  const pdfUrl = `${SITE_URL}/api/calculadora-rsc/pdf?id=${created.id}`;

  // Email al cliente con link al PDF + datos resumen
  await sendEmail({
    to: data.email,
    subject: `Tu certificado ROI RSC · ${results.co2SavedKg} kg CO₂ ahorrados / año`,
    context: `roi-calc · ${created.id}`,
    html: `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">
        <div style="padding:32px 32px 24px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Tu cálculo RSC</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:#2A2A2A;">
            Hola ${escapeHtml(firstName)}.<br>
            <span style="color:#E63E73;">Esto es lo que generarías.</span>
          </h1>
        </div>
        <div style="padding:0 32px 16px;">
          <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">
            <tr><td style="background:#FBDFE9;padding:18px 20px;border-radius:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">CO₂ ahorrado / año</p>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#E63E73;">${results.co2SavedKg} kg</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b6b6b;">≈ ${results.treesEquivalent} árboles equivalentes</p>
            </td></tr>
            <tr><td style="background:#F4EFE6;padding:18px 20px;border-radius:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">Horas trabajo digno generadas</p>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#2A2A2A;">${results.workHoursDignified} h</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b6b6b;">En Centros Especiales de Empleo Andalucía</p>
            </td></tr>
            <tr><td style="background:#F4EFE6;padding:18px 20px;border-radius:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">% producción en CEE</p>
              <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#2A2A2A;">${results.ceeProductionPct}%</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b6b6b;">Verificable y reportable en GRI / EFRAG</p>
            </td></tr>
          </table>
        </div>
        <div style="padding:8px 32px 24px;text-align:center;">
          <a href="${pdfUrl}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Descargar certificado PDF →</a>
          <p style="margin:14px 0 0;font-size:13px;color:#6b6b6b;line-height:1.5;">
            ¿Quieres pasar del cálculo a un pedido real?<br>
            Entra en <a href="https://merchandising.startidea.es/catalogo" style="color:#E63E73;">nuestro catálogo</a>
            y verás precio al instante por producto.
          </p>
        </div>
        <div style="background:#2A2A2A;padding:20px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px;">todo<span style="color:#E63E73;">merchandising</span></p>
          <p style="margin:6px 0 0;">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        </div>
      </div>
    </div>`,
  });

  // Alerta interna Telegram
  await notifyTelegram(
    `<b>📊 Nuevo lead calculadora ROI RSC</b>\n` +
      `${escapeTgHtml(data.name || "(sin nombre)")}${data.company ? ` · ${escapeTgHtml(data.company)}` : ""}\n` +
      `${data.email}\n` +
      `Empleados: ${data.employees} · Presupuesto: ${data.annualBudgetEur}€/año · Sustitución: ${data.substitutionPct}%\n` +
      `Resultado: ${results.co2SavedKg} kg CO₂ · ${results.workHoursDignified} h trabajo digno`,
    { parseMode: "HTML" },
  ).catch((e) =>
    console.error("[calculadora-rsc] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true, id: created.id, results });
}
