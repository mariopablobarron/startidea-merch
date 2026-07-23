import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const Schema = z.object({
  artworkUrl: z.string().url().max(500),
  productSlug: z.string().min(1).optional(),
  midoceanProofId: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Crear un proof a partir de un CartQuote y enviar email al cliente con
 * el link único para aprobar/rechazar/subir artwork.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { name: true, email: true, company: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  const proof = await prisma.orderProof.create({
    data: {
      cartId: id,
      artworkUrl: parsed.data.artworkUrl,
      productSlug: parsed.data.productSlug,
      midoceanProofId: parsed.data.midoceanProofId,
      notes: parsed.data.notes,
    },
  });

  const proofUrl = `${SITE_URL}/proof/${proof.token}`;

  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: cart.email,
        subject: `${cart.name.split(" ")[0]}, tu mockup está listo para revisar`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;">
            <h2 style="font-family:Georgia,serif;color:#0a0a0b;">Tu mockup está listo</h2>
            <p>Hola ${cart.name.split(" ")[0]},</p>
            <p>Hemos preparado el mockup de tu pedido. Revísalo y elige una opción:</p>
            <p style="text-align:center;margin:32px 0;">
              <a href="${proofUrl}" style="background:#ff6b35;color:white;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ver mockup y decidir →</a>
            </p>
            <p style="font-size:13px;color:#666;">El link es privado y único para este pedido. No es necesario crear cuenta.</p>
            <p style="color:#888;font-size:12px;margin-top:32px;">STARTIDEA MALAGA SL · CIF B19583632</p>
          </div>`,
      })
      .catch((err) => console.error("[proof create email]", err));
  }

  return NextResponse.json({ ok: true, proofId: proof.id, token: proof.token, url: proofUrl });
}
