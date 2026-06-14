import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_OUTBOUND || process.env.OPENROUTER_MODEL_COPY || "anthropic/claude-sonnet-4.5";

/**
 * POST /api/admin/outbound/discover  { niche, zone? }
 *
 * Asistente de sourcing B2B: dado un nicho (+zona), la IA devuelve el cliente
 * ideal (ICP), ángulo de venta, directorios/asociaciones donde encontrarlos, e
 * ideas de empresas candidatas (a VERIFICAR). Los enlaces de búsqueda reales
 * (Maps/Google/LinkedIn) los compone el frontend de forma determinista.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!OPENROUTER_API_KEY) return NextResponse.json({ error: "OPENROUTER_API_KEY no configurado" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { niche?: string; zone?: string };
  const niche = (body.niche || "").trim().slice(0, 120);
  const zone = (body.zone || "Granada").trim().slice(0, 80);
  if (!niche) return NextResponse.json({ error: "Indica un nicho/sector" }, { status: 400 });

  const system = `Eres un estratega de sourcing B2B para TodoMerchandising (marca de Startidea, Granada): merchandising personalizado (textil, banderas, regalos de empresa) producido en Centros Especiales de Empleo, con impacto social. Vendes a empresas/organizaciones que necesitan merch.

Dado un NICHO y una ZONA, devuelve JSON:
{
 "icp": "1-2 frases: quién es el cliente ideal dentro de ese nicho y por qué necesita merch",
 "pitch": "1 frase: el ángulo de venta más potente para ese nicho (incluye el gancho de impacto social si encaja)",
 "directories": [{"name":"nombre del directorio/asociación/cámara real y conocido","url":"https://… si lo sabes, si no cadena vacía"}],  // 4-6, reales y específicos de España/la zona
 "candidates": [{"name":"empresa/organización candidata","website":"dominio si lo sabes o cadena vacía","reason":"por qué encaja"}]  // 8-12 IDEAS a verificar, prioriza entidades reales y conocidas de la zona
}
Sé concreto y realista. NO inventes emails ni teléfonos. Si no estás seguro de un dato, déjalo vacío. Español.`;

  const user = `NICHO: ${niche}\nZONA: ${zone}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://merchandising.hubstartidea.es",
        "X-Title": "TodoMerchandising Prospect Sourcing",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `OpenRouter HTTP ${res.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Respuesta IA vacía" }, { status: 502 });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      parsed = m ? JSON.parse(m[1]) : {};
    }
    return NextResponse.json({ ok: true, niche, zone, result: parsed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
