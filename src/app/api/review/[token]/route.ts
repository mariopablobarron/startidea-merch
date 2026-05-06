import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";

export const runtime = "nodejs";

const Schema = z.object({
  npsScore: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
  authorName: z.string().max(120).optional(),
  authorCompany: z.string().max(160).optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
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

  // Aviso interno (no público hasta que admin apruebe)
  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Review NPS ${parsed.data.npsScore}/10] ${parsed.data.authorName || review.authorName}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h3 style="margin-top:0;">Nueva review · NPS ${parsed.data.npsScore}/10</h3>
          <p><strong>${parsed.data.authorName || review.authorName}</strong>${parsed.data.authorCompany ? ` · ${parsed.data.authorCompany}` : ""}</p>
          ${parsed.data.comment ? `<blockquote style="border-left:3px solid #ff6b35;padding-left:12px;color:#444;">${parsed.data.comment.replace(/\n/g, "<br>")}</blockquote>` : "<p style='color:#888'><em>Sin comentario</em></p>"}
          <p style="font-size:12px;color:#888;">Pública: ${parsed.data.isPublic ? "sí" : "no"} · Cart ID <code>${review.cartId}</code></p>
        </div>`,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
