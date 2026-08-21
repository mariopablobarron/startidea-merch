import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { rateLimit } from "@/lib/rate-limit";
import { reviewInternalEmailHtml, reviewInternalEmailSubject } from "@/lib/proof-review-emails";

export const runtime = "nodejs";

const Schema = z.object({
  npsScore: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
  authorName: z.string().max(120).optional(),
  authorCompany: z.string().max(160).optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // El token es el único control de acceso: sin tope, esta ruta se puede usar
  // para enumerar tokens a ciegas. Enviar una review es un acto único.
  const rl = rateLimit(req, { key: "review-submit", max: 10, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const review = await prisma.review.findUnique({ where: { token } });
  if (!review) return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
  if (review.submittedAt) {
    return NextResponse.json({ error: "Ya enviada" }, { status: 409 });
  }

  await prisma.review.update({
    where: { id: review.id },
    data: {
      npsScore: parsed.data.npsScore,
      comment: parsed.data.comment,
      authorName: parsed.data.authorName ?? review.authorName,
      authorCompany: parsed.data.authorCompany ?? review.authorCompany,
      isPublic: parsed.data.isPublic ?? review.isPublic,
      submittedAt: new Date(),
    },
  });

  const datosReview = {
    npsScore: parsed.data.npsScore,
    authorName: parsed.data.authorName || review.authorName,
    authorCompany: parsed.data.authorCompany ?? review.authorCompany,
    comment: parsed.data.comment,
    isPublic: parsed.data.isPublic ?? review.isPublic,
    cartId: review.cartId,
  };

  // Aviso interno (no público hasta que admin apruebe)
  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: reviewInternalEmailSubject(datosReview),
        html: reviewInternalEmailHtml(datosReview),
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
