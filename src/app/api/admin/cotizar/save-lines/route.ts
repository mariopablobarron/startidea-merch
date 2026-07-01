import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { computeCotizacion, type CotizarInput, type CotizarOk } from "@/lib/cotizar-core";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cotizar/save-lines
 *
 * Guarda un presupuesto MULTILÍNEA como CartQuote editable. Recibe el contacto +
 * una lista de líneas (mismos parámetros que /api/admin/cotizar) y RE-CALCULA
 * cada línea server-side con computeCotizacion (fuente de verdad: el cliente no
 * puede falsear el precio). Persiste CartQuote(status=IN_PROGRESS,
 * source=admin-cotizador) + CartQuoteItem[] con el snapshot de precio.
 *
 * Convención de importes (coherente con el resto: precios SIN IVA, el 21% se
 * añade en el cobro):
 *   - CartQuoteItem.unitPriceClientCents = pvp.unit    (PVP unitario, SIN IVA)
 *   - CartQuoteItem.totalClientCents      = pvp.baseTotal (línea, SIN IVA)
 *   - CartQuote.estimatedTotalCents       = Σ baseTotal   (SIN IVA)
 *
 * Nunca se persiste supplierRef (regla de no-exposición): usamos publicRef.
 */

const LineSchema = z.object({
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  techniqueCode: z.string().min(1).max(20).optional(),
  marginPct: z.number().min(0).max(900).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
  portesCents: z.number().int().min(0).max(1_000_000).optional(),
  couponCode: z.string().min(1).max(40).optional(),
});

const Schema = z.object({
  contact: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(200),
    company: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
  }),
  notes: z.string().max(4000).optional(),
  lines: z.array(LineSchema).min(1).max(50),
});

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
  const { contact, notes, lines } = parsed.data;

  // Recomputar cada línea server-side.
  const computed = await Promise.all(
    lines.map((l) => computeCotizacion(l as CotizarInput)),
  );
  const failed = computed
    .map((r, i) => (r.ok ? null : { index: i, ref: lines[i].ref, error: r.error }))
    .filter((x): x is { index: number; ref: string; error: string } => x !== null);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: "Algunas líneas no se pudieron cotizar", failed },
      { status: 422 },
    );
  }

  // Todas las líneas son ok aquí (failed.length === 0), así que okLines mantiene
  // el orden y longitud de `lines` → el índice alinea para leer numberOfColours.
  const okLines = computed.filter((r): r is CotizarOk => r.ok);
  let estimatedTotalCents = 0;
  const itemsData = okLines.map((r, idx) => {
    estimatedTotalCents += r.pvp.baseTotal;
    return {
      productSlug: r.product.slug,
      productRef: r.product.publicRef, // NUNCA supplierRef
      productName: r.product.name,
      primaryImageUrl: r.product.imageUrl,
      quantity: r.qty,
      markingTechniqueCode: r.marking?.techniqueCode ?? null,
      markingTechniqueName: r.marking?.techniqueLabel ?? null,
      markingColours: lines[idx].numberOfColours ?? null,
      unitPriceClientCents: r.pvp.unit,
      totalClientCents: r.pvp.baseTotal,
    };
  });

  const cart = await prisma.cartQuote.create({
    data: {
      name: contact.name,
      email: contact.email,
      company: contact.company || null,
      phone: contact.phone || null,
      source: "admin-cotizador",
      status: "IN_PROGRESS",
      internalNotes: notes || null,
      estimatedTotalCents,
      items: { create: itemsData },
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    cartId: cart.id,
    itemCount: itemsData.length,
    estimatedTotalCents,
  });
}
