import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/resend";
import { CartItemSchema, cartItemToCreate } from "@/lib/cart-item-schema";
import { normalizeProductName } from "@/lib/product-name";
import { resolveSupplierOrderVariants } from "@/lib/supplier-order-variant";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

/**
 * Captura TEMPRANA de email en el carrito — "¿Te guardamos el carrito?".
 *
 * El agujero que cubre: los recordatorios de carrito abandonado (drip 24h/72h/
 * 7d) solo alcanzan a quien dejó email; quien añade productos y se va sin
 * cotizar era invisible. Este endpoint crea un CartQuote IN_PROGRESS con solo
 * el email → entra solo en el drip existente, y manda al momento un email con
 * el enlace de recuperación (restaura el carrito en cualquier dispositivo).
 *
 * Dedup: un guardado previo del mismo email (source carrito-guardado, aún
 * IN_PROGRESS, <7 días) se ACTUALIZA con los items nuevos en vez de crear
 * otro — sin reenviar el email y conservando createdAt (el reloj del drip).
 */

const Schema = z.object({
  email: z.string().email().max(160),
  items: z.array(CartItemSchema).min(1).max(40),
});

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export async function POST(req: Request) {
  const rl = rateLimit(req, { key: "save-cart", max: 6, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const canonicalVariants = await resolveSupplierOrderVariants(
    parsed.data.items.map((item) => ({
      productSlug: item.productSlug,
      variantId: item.variantId,
      variantSku: item.variantSku,
    })),
  );
  if (!canonicalVariants.ok) {
    return NextResponse.json(
      { error: "Hay un producto cuya variante no es válida.", code: canonicalVariants.code },
      { status: 422 },
    );
  }
  const items = parsed.data.items.map((item, index) => {
    const canonical = canonicalVariants.items[index];
    const { variantId: _publicVariantId, ...legacyCompatibleItem } = item;
    return {
      ...legacyCompatibleItem,
      productSlug: canonical.canonicalSlug,
      variantSku: canonical.variantId ? canonical.sku : null,
      colorName: canonical.colorName,
    };
  });

  // Dedup: reutilizar el guardado vivo más reciente de este email.
  const existing = await prisma.cartQuote.findFirst({
    where: {
      email,
      source: "carrito-guardado",
      status: "IN_PROGRESS",
      createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  let cartId: string;
  let isNew = false;
  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.cartQuoteItem.deleteMany({ where: { cartId: existing.id } });
      await tx.cartQuote.update({
        where: { id: existing.id },
        data: { items: { create: items.map(cartItemToCreate) } },
      });
    });
    cartId = existing.id;
  } else {
    isNew = true;
    const created = await prisma.cartQuote.create({
      data: {
        // Sin nombre aún: usamos la parte local del email como saludo neutro.
        name: email.split("@")[0].slice(0, 60) || "Cliente",
        email,
        source: "carrito-guardado",
        status: "IN_PROGRESS",
        message: null,
        internalNotes: "Carrito guardado por el cliente (captura temprana de email, sin cotizar aún)",
        estimatedTotalCents: items.reduce((s, it) => s + (it.totalClientCents || 0), 0),
        items: { create: items.map(cartItemToCreate) },
      },
      select: { id: true },
    });
    cartId = created.id;
  }

  // Email inmediato SOLO la primera vez (las actualizaciones son silenciosas).
  if (isNew) {
    const recoverUrl = `${SITE_URL}/carrito?recover=${encodeURIComponent(cartId)}`;
    const total = items.reduce((s, it) => s + (it.totalClientCents || 0), 0);
    const lines = items
      .slice(0, 6)
      .map(
        (it) =>
          `<li>${it.quantity} × ${escapeHtml(normalizeProductName(it.productName))}</li>`,
      )
      .join("");
    void sendEmail({
      to: email,
      subject: "Tu carrito te espera en TodoMerchandising",
      html: `
        <p>¡Hola! Te hemos guardado el carrito tal y como lo dejaste:</p>
        <ul>${lines}${items.length > 6 ? `<li>… y ${items.length - 6} más</li>` : ""}</ul>
        ${total > 0 ? `<p>Total estimado: <b>${EUR.format(total / 100)}</b> (sin IVA)</p>` : ""}
        <p><a href="${recoverUrl}" style="display:inline-block;background:#231f27;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Retomar mi carrito</a></p>
        <p style="font-size:12px;color:#888">El enlace restaura tu carrito en cualquier dispositivo. Usamos tu email solo para enviarte tu carrito y recordártelo — nada de listas de marketing. <a href="${SITE_URL}/privacidad">Privacidad</a>.</p>
      `,
      context: `save-for-later · ${cartId}`,
    });
  }

  return NextResponse.json({ ok: true, cartId, updated: !isNew });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
