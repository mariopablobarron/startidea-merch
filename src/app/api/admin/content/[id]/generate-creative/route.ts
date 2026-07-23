import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const TEMPLATES = [
  "post-square",
  "story-vertical",
  "linkedin-landscape",
  "email-header",
] as const;

const VARIANTS = ["magenta-bg", "crema-bg"] as const;

const Schema = z.object({
  template: z.enum(TEMPLATES).default("post-square"),
  variant: z.enum(VARIANTS).default("magenta-bg"),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullable().optional(),
  cta: z.string().max(60).nullable().optional(),
  productImageUrl: z.string().url().nullable().optional(),
});

/**
 * Construye URL de la creatividad (parámetros + endpoint /api/og/creative)
 * y la persiste en la pieza como creativeUrl.
 *
 * Ventaja: la URL es determinística — mismo input = misma imagen cacheada
 * 1h en CDN. Si quieres regenerar, cambia un parámetro o añade ?v=N.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!piece) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (piece.status === "PUBLISHED" || piece.status === "ARCHIVED") {
    return NextResponse.json({ error: "Pieza ya publicada o archivada" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const qs = new URLSearchParams({
    template: d.template,
    variant: d.variant,
    title: d.title,
    ...(d.subtitle ? { subtitle: d.subtitle } : {}),
    ...(d.cta ? { cta: d.cta } : {}),
    ...(d.productImageUrl ? { product: d.productImageUrl } : {}),
    // Anti-cache token cuando admin regenera con mismos params (ej tras editar manual)
    v: String(Math.floor(Date.now() / 1000)),
  });

  const creativeUrl = `${SITE_URL}/api/og/creative?${qs}`;

  // Guardar brief para auditoría/regenerar
  const creativeBrief = JSON.stringify({
    template: d.template,
    variant: d.variant,
    title: d.title,
    subtitle: d.subtitle,
    cta: d.cta,
    productImageUrl: d.productImageUrl,
    generatedAt: new Date().toISOString(),
    by: session.email,
  });

  await prisma.contentPiece.update({
    where: { id },
    data: { creativeUrl, creativeBrief },
  });

  return NextResponse.json({ ok: true, creativeUrl, brief: JSON.parse(creativeBrief) });
}
