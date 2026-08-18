import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { midoceanProofs } from "@/lib/suppliers/midocean-orders";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";

export const runtime = "nodejs";

const Schema = z.object({ decidedBy: z.string().email().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const proof = await prisma.orderProof.findUnique({
    where: { token },
    include: { cart: { select: { name: true, email: true, company: true } } },
  });
  if (!proof) return NextResponse.json({ error: "Proof no encontrado" }, { status: 404 });
  if (proof.status !== "PENDING") {
    return NextResponse.json({ error: "Proof ya decidido", status: proof.status }, { status: 409 });
  }

  // Si hay midoceanProofId, también lo aprobamos en MidOcean (dry-run por defecto)
  if (proof.midoceanProofId) {
    const r = await midoceanProofs.approve(proof.midoceanProofId);
    if (!r.ok) {
      // NO marcar APPROVED local si el proveedor falla: evita desincronizar
      // (el equipo creería que está en producción cuando MidOcean no lo registró).
      // (bug-bounty 2026-06-17)
      console.error("[proof approve] midocean error", r);
      void notifyTelegram(
        `⚠️ <b>Fallo al aprobar proof en MidOcean</b>\n${escapeTgHtml(proof.cart.name)} · cart <code>${proof.cartId.slice(0, 8)}</code>\nNO se ha marcado APPROVED local. Revisar/reintentar manualmente.`,
      ).catch((e) =>
        console.error("[proof approve] notifyTelegram (fallo midocean) falló:", e instanceof Error ? e.message : e),
      );
      return NextResponse.json(
        { error: "No se pudo confirmar la aprobación con el proveedor. Inténtalo de nuevo en unos minutos." },
        { status: 502 },
      );
    }
  }

  const updated = await prisma.orderProof.update({
    where: { id: proof.id },
    data: {
      status: "APPROVED",
      decidedAt: new Date(),
      decidedBy: parsed.data.decidedBy || proof.cart.email,
    },
  });

  // Notificar al equipo
  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Proof aprobado] ${proof.cart.name}${proof.cart.company ? " · " + proof.cart.company : ""}`,
        html: `<p>El cliente <strong>${proof.cart.name}</strong> (${proof.cart.email}) ha aprobado el proof.</p><p>Proof ID: <code>${proof.id}</code></p>`,
      })
      .catch((err) => console.error("[proof approve] resend", err));
  }

  void emitWebhook("proof.status.changed", {
    cartId: proof.cartId,
    proofId: proof.id,
    fromStatus: "PENDING",
    toStatus: "APPROVED",
    at: new Date().toISOString(),
  });

  void notifyTelegram(
    `✅ <b>Mockup aprobado</b>\n${escapeTgHtml(proof.cart.name)}${proof.cart.company ? ` · ${escapeTgHtml(proof.cart.company)}` : ""}\n📧 ${proof.cart.email}\nCart <code>${proof.cartId.slice(0, 8)}</code> · pasamos producción a marcha`,
  ).catch((e) =>
    console.error("[proof approve] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true, status: updated.status });
}
