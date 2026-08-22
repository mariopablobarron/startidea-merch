/**
 * POST /api/track/product-event
 *
 * Cuerpo: { productId, event: "view" | "cart_add" | "proposal" | "recommender" }
 *
 * Upsert atómico en ProductView con increment del contador correspondiente.
 * Fire-and-forget desde el cliente — devuelve 200 inmediato sin esperar.
 *
 * Con cupo por IP (`track-rate-limit.ts`): el navegador dispara 1 view por
 * producto abierto y cart_add solo en un add real, así que el tope holgado no
 * estorba a nadie — pero sin él un bucle desde una IP infla los contadores que
 * alimentan «lo más visto» y el recomendador, escribiendo en BD en cada POST.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveProductBySlug } from "@/lib/product-slug-resolver";
import { trackRateLimit } from "@/lib/track-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    productId: z.string().min(1).max(40).optional(),
    slug: z.string().min(1).max(120).optional(),
    event: z.enum(["view", "cart_add", "proposal", "recommender"]),
  })
  .refine((b) => b.productId || b.slug, {
    message: "productId or slug required",
  });

export async function POST(req: Request) {
  const rl = trackRateLimit(req, "track-product-event");
  if (!rl.ok) return rl.response;

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });
  }

  // Resolver slug → productId si solo viene slug
  let productId = body.productId;
  if (!productId && body.slug) {
    const resolved = await resolveProductBySlug(body.slug, (slug) =>
      prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      }),
    );
    if (!resolved) return NextResponse.json({ ok: false, error: "NOT_FOUND" });
    productId = resolved.product.id;
  }
  if (!productId) {
    return NextResponse.json({ ok: false, error: "NO_PRODUCT" }, { status: 400 });
  }

  const { event } = body;

  try {
    // Increment según el evento. Upsert atómico para evitar race con
    // primer view del producto.
    const incrementFields: Record<string, { increment: number }> = {};
    const setOnInsert: Record<string, number | Date> = {
      viewCount: 0,
      cartAddCount: 0,
      proposalCount: 0,
      recommenderCount: 0,
      view30d: 0,
      cartAdd30d: 0,
    };

    if (event === "view") {
      incrementFields.viewCount = { increment: 1 };
      incrementFields.view30d = { increment: 1 };
      setOnInsert.viewCount = 1;
      setOnInsert.view30d = 1;
    } else if (event === "cart_add") {
      incrementFields.cartAddCount = { increment: 1 };
      incrementFields.cartAdd30d = { increment: 1 };
      setOnInsert.cartAddCount = 1;
      setOnInsert.cartAdd30d = 1;
    } else if (event === "proposal") {
      incrementFields.proposalCount = { increment: 1 };
      setOnInsert.proposalCount = 1;
    } else if (event === "recommender") {
      incrementFields.recommenderCount = { increment: 1 };
      setOnInsert.recommenderCount = 1;
    }

    const updateData: Record<string, unknown> = { ...incrementFields };
    if (event === "cart_add") {
      updateData.lastCartAddAt = new Date();
    }

    await prisma.productView.upsert({
      where: { productId },
      update: updateData,
      create: { productId, ...setOnInsert },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // No tira: si el productId no existe (404) o hay error de BD, no
    // queremos romper la UX del cliente. Log silencioso.
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "INTERNAL",
    });
  }
}
