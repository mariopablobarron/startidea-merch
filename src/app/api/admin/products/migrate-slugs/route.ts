import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { resolveCleanProductSlug } from "@/lib/suppliers/midocean-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Migración one-shot de slugs de Product:
 *   - Detecta productos cuyo slug contiene el supplier SKU (master_code).
 *   - Genera un slug LIMPIO sólo con el nombre comercial.
 *   - Archiva el slug antiguo en ProductSlugRedirect → 301 desde el detalle.
 *
 * Modos:
 *   GET  /api/admin/products/migrate-slugs?dry=1 (default)
 *     → audita y devuelve qué cambiaría sin tocar nada.
 *   POST /api/admin/products/migrate-slugs
 *     → ejecuta la migración.
 *
 * Auth: X-Admin-Secret. Idempotente — productos ya limpios se ignoran.
 */

type Plan = {
  productId: string;
  name: string;
  supplierRef: string;
  oldSlug: string;
  newSlug: string;
};

async function buildPlan(): Promise<Plan[]> {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, supplier: true, supplierRef: true, slug: true },
  });

  const plan: Plan[] = [];
  // Mapa local para detectar colisiones contra otros newSlug ya planeados,
  // sin tener que ir y volver a Postgres en cada iteración.
  const reserved = new Set<string>(products.map((p) => p.slug));

  for (const p of products) {
    const masterToken = p.supplierRef.toLowerCase();
    if (!p.slug.toLowerCase().includes(masterToken)) continue; // ya limpio
    // Reservar el viejo nombre durante la planificación
    reserved.delete(p.slug);
    const candidate = await pickCleanSlug(p.name, p.id, reserved);
    reserved.add(candidate);
    plan.push({
      productId: p.id,
      name: p.name,
      supplierRef: p.supplierRef,
      oldSlug: p.slug,
      newSlug: candidate,
    });
  }
  return plan;
}

async function pickCleanSlug(
  name: string,
  selfId: string,
  reserved: Set<string>,
): Promise<string> {
  // Usamos el mismo resolver, pero filtramos también colisiones planeadas
  // en este mismo batch (que aún no están en DB).
  // Primer candidato: pasada limpia por DB.
  let candidate = await resolveCleanProductSlug(name, selfId);
  if (!reserved.has(candidate)) return candidate;
  // Si el batch ya planeó este slug para otro producto, añadir sufijo.
  let i = 2;
  while (i <= 99) {
    const next = `${candidate}-${i}`;
    if (!reserved.has(next)) {
      candidate = next;
      break;
    }
    i++;
  }
  return candidate;
}

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const plan = await buildPlan();
  return NextResponse.json({
    dryRun: true,
    affected: plan.length,
    preview: plan.slice(0, 50),
    note:
      plan.length === 0
        ? "Todos los slugs ya están limpios. Nada que migrar."
        : `POST a este mismo endpoint para aplicar ${plan.length} cambios.`,
  });
}

export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const plan = await buildPlan();
  if (plan.length === 0) {
    return NextResponse.json({ ok: true, affected: 0, message: "Nada que migrar." });
  }

  let migrated = 0;
  const errors: Array<{ productId: string; error: string }> = [];

  // Aplicamos uno a uno (la unique constraint impide batch ciego):
  //   1) crear/upsert redirect oldSlug → productId
  //   2) actualizar product.slug
  for (const item of plan) {
    try {
      await prisma.$transaction([
        prisma.productSlugRedirect.upsert({
          where: { oldSlug: item.oldSlug },
          create: { oldSlug: item.oldSlug, productId: item.productId },
          update: { productId: item.productId },
        }),
        prisma.product.update({
          where: { id: item.productId },
          data: { slug: item.newSlug },
        }),
      ]);
      migrated++;
    } catch (e) {
      errors.push({
        productId: item.productId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    affected: plan.length,
    migrated,
    errors: errors.slice(0, 20),
  });
}
