import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { generateCopy } from "@/lib/content-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES = ["POST", "STORY", "REEL", "CARRUSEL", "EMAIL", "AD", "BLOG", "LANDING"] as const;
const CHANNELS = [
  "IG", "FB", "LINKEDIN", "X", "TIKTOK", "YOUTUBE", "PINTEREST",
  "EMAIL", "WEB", "GOOGLE_ADS", "META_ADS", "LINKEDIN_ADS",
] as const;

const Schema = z.object({
  type: z.enum(TYPES),
  channel: z.enum(CHANNELS),
  topic: z.string().min(3).max(500),
  productName: z.string().max(200).optional(),
  productPrice: z.string().max(50).optional(),
  sector: z.string().max(80).optional(),
  cta: z.string().max(120).optional(),
  customInstructions: z.string().max(1000).optional(),
});

/**
 * POST /api/admin/content/generate
 * Devuelve 3 variaciones de copy generadas por IA según el brief.
 * No persiste nada — solo genera. El admin elige y luego crea con POST /content.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await generateCopy(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    variations: result.variations,
    model: result.model,
  });
}
