import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { midoceanProofs } from "@/lib/suppliers/midocean-orders";
import { resend, RESEND_FROM, RESEND_TO_INTERNAL } from "@/lib/resend";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";

export const runtime = "nodejs";

const Schema = z.object({
  artworkUrl: z.string().url().max(500),
  decidedBy: z.string().email().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "URL del artwork inválida" }, { status: 400 });

  const proof = await prisma.orderProof.findUnique({
    where: { token },
    include: { cart: { select: { name: true, email: true, company: true } } },
  });
  if (!proof) return NextResponse.json({ error: "Proof no encontrado" }, { status: 404 });
  if (proof.status !== "PENDING") {
    return NextResponse.json({ error: "Proof ya decidido", status: proof.status }, { status: 409 });
  }

  if (proof.midoceanProofId) {
    const r = await midoceanProofs.addArtwork(proof.midoceanProofId, parsed.data.artworkUrl);
    if (!r.ok) console.error("[proof revision] midocean error", r);
  }

  const updated = await prisma.orderProof.update({
    where: { id: proof.id },
    data: {
      status: "REVISION",
      decidedAt: new Date(),
      decidedBy: parsed.data.decidedBy || proof.cart.email,
      artworkUrl: parsed.data.artworkUrl,
    },
  });

  if (resend) {
    void resend.emails
      .send({
        from: RESEND_FROM,
        to: RESEND_TO_INTERNAL,
        subject: `[Proof artwork nuevo] ${proof.cart.name}${proof.cart.company ? " · " + proof.cart.company : ""}`,
        html: `<p>El cliente <strong>${proof.cart.name}</strong> ha subido artwork nuevo.</p><p>URL: <a href="${parsed.data.artworkUrl}">${parsed.data.artworkUrl}</a></p><p>Proof ID: <code>${proof.id}</code></p>`,
      })
      .catch((err) => console.error("[proof revision] resend", err));
  }

  void notifyTelegram(
    `🎨 <b>Artwork nuevo subido</b>\n${escapeTgHtml(proof.cart.name)}${proof.cart.company ? ` · ${escapeTgHtml(proof.cart.company)}` : ""}\n📧 ${proof.cart.email}\nURL: ${escapeTgHtml(parsed.data.artworkUrl.slice(0, 100))}\nCart <code>${proof.cartId.slice(0, 8)}</code>`,
  ).catch(() => {});

  return NextResponse.json({ ok: true, status: updated.status });
}
