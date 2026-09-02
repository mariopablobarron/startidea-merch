import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { midoceanProofs } from "@/lib/suppliers/midocean-orders";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";

export const runtime = "nodejs";

const Schema = z.object({
  reason: z.string().min(10).max(2000),
  decidedBy: z.string().email().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Motivo requerido (mín 10 caracteres)" }, { status: 400 });

  const proof = await prisma.orderProof.findUnique({
    where: { token },
    include: { cart: { select: { name: true, email: true, company: true } } },
  });
  if (!proof) return NextResponse.json({ error: "Proof no encontrado" }, { status: 404 });
  if (proof.status !== "PENDING") {
    return NextResponse.json({ error: "Proof ya decidido", status: proof.status }, { status: 409 });
  }

  if (proof.midoceanProofId) {
    const r = await midoceanProofs.reject(proof.midoceanProofId, parsed.data.reason);
    if (!r.ok) console.error("[proof reject] midocean error", r);
  }

  const updated = await prisma.orderProof.update({
    where: { id: proof.id },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedBy: parsed.data.decidedBy || proof.cart.email,
      rejectionReason: parsed.data.reason,
    },
  });

  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Proof rechazado] ${proof.cart.name}${proof.cart.company ? " · " + proof.cart.company : ""}`,
        html: `<p>El cliente <strong>${proof.cart.name}</strong> (${proof.cart.email}) ha rechazado el proof.</p><p>Motivo:</p><blockquote>${parsed.data.reason.replace(/\n/g, "<br>")}</blockquote><p>Proof ID: <code>${proof.id}</code></p>`,
      })
      .catch((err) => console.error("[proof reject] resend", err));
  }

  void emitWebhook("proof.status.changed", {
    cartId: proof.cartId,
    proofId: proof.id,
    fromStatus: "PENDING",
    toStatus: "REJECTED",
    reason: parsed.data.reason,
    at: new Date().toISOString(),
  });

  // Nombre/empresa/email salen del formulario del cliente y el motivo lo redacta él
  // mismo al rechazar ("el logo sale < que en la muestra", "Pérez & Cía"). Sin escapar,
  // Telegram responde 400 y el rechazo —el aviso más urgente de todos— se pierde en
  // silencio: notifyTelegram devuelve res.ok y aquí solo se captura la excepción.
  void notifyTelegram(
    `❌ <b>Mockup rechazado</b>\n${escapeTgHtml(proof.cart.name)}${proof.cart.company ? ` · ${escapeTgHtml(proof.cart.company)}` : ""}\n📧 ${escapeTgHtml(proof.cart.email)}\nMotivo: <i>${escapeTgHtml(parsed.data.reason.slice(0, 200))}</i>\nCart <code>${proof.cartId.slice(0, 8)}</code>`,
  ).catch((e) =>
    console.error("[proof reject] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true, status: updated.status });
}
