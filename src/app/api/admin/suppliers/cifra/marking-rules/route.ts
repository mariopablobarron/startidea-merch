import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { listDistinctMarkingHintsForSupplier } from "@/lib/supplier-marking-rules";
import { validateMarkingTiers } from "@/lib/marking-tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/cifra/marking-rules
 *
 * Devuelve:
 *   - rules: SupplierMarkingRule existentes (supplier=cifra)
 *   - hints: códigos de técnica únicos encontrados en Product.markingTechniqueHint
 *            del catálogo Cifra, ordenados por nº de productos que los usan.
 *            Útil para guiar al admin: "estos códigos aparecen, dales de alta".
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rules = await prisma.supplierMarkingRule.findMany({
    where: { supplier: "cifra" },
    orderBy: [{ active: "desc" }, { techniqueCode: "asc" }],
  });
  const hints = await listDistinctMarkingHintsForSupplier("cifra");
  return NextResponse.json({ ok: true, rules, hints });
}

const TierFields = {
  tier1MinQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  tier1UnitCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  tier2MinQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  tier2UnitCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  tier3MinQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  tier3UnitCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  tier4MinQty: z.number().int().min(1).max(1_000_000).nullable().optional(),
  tier4UnitCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
};

const CreateSchema = z.object({
  techniqueCode: z
    .string()
    .min(1)
    .max(10)
    .transform((s) => s.trim().toUpperCase()),
  techniqueLabel: z.string().min(2).max(80),
  markupPct: z.number().int().min(0).max(500),
  setupCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  ...TierFields,
});

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const tiersError = validateMarkingTiers(d);
  if (tiersError) {
    return NextResponse.json({ error: tiersError }, { status: 400 });
  }
  try {
    const rule = await prisma.supplierMarkingRule.create({
      data: {
        supplier: "cifra",
        techniqueCode: d.techniqueCode,
        techniqueLabel: d.techniqueLabel,
        markupPct: d.markupPct,
        setupCents: d.setupCents ?? null,
        active: d.active ?? true,
        notes: d.notes ?? null,
        tier1MinQty: d.tier1MinQty ?? null,
        tier1UnitCents: d.tier1UnitCents ?? null,
        tier2MinQty: d.tier2MinQty ?? null,
        tier2UnitCents: d.tier2UnitCents ?? null,
        tier3MinQty: d.tier3MinQty ?? null,
        tier3UnitCents: d.tier3UnitCents ?? null,
        tier4MinQty: d.tier4MinQty ?? null,
        tier4UnitCents: d.tier4UnitCents ?? null,
      },
    });
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Ya existe una regla para la técnica ${d.techniqueCode}` },
        { status: 409 },
      );
    }
    throw err;
  }
}

const PatchSchema = z.object({
  id: z.string(),
  techniqueLabel: z.string().min(2).max(80).optional(),
  markupPct: z.number().int().min(0).max(500).optional(),
  setupCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  ...TierFields,
});

export async function PATCH(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { id, ...data } = parsed.data;
  // PATCH es parcial: los tramos hay que validarlos sobre el estado RESULTANTE.
  // Validar solo lo enviado dejaría pasar un cambio de una sola casilla que
  // desordena la tabla o deja un tramo huérfano.
  const actual = await prisma.supplierMarkingRule.findUnique({ where: { id } });
  if (!actual) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const resultante = {
    tier1MinQty: data.tier1MinQty !== undefined ? data.tier1MinQty : actual.tier1MinQty,
    tier1UnitCents: data.tier1UnitCents !== undefined ? data.tier1UnitCents : actual.tier1UnitCents,
    tier2MinQty: data.tier2MinQty !== undefined ? data.tier2MinQty : actual.tier2MinQty,
    tier2UnitCents: data.tier2UnitCents !== undefined ? data.tier2UnitCents : actual.tier2UnitCents,
    tier3MinQty: data.tier3MinQty !== undefined ? data.tier3MinQty : actual.tier3MinQty,
    tier3UnitCents: data.tier3UnitCents !== undefined ? data.tier3UnitCents : actual.tier3UnitCents,
    tier4MinQty: data.tier4MinQty !== undefined ? data.tier4MinQty : actual.tier4MinQty,
    tier4UnitCents: data.tier4UnitCents !== undefined ? data.tier4UnitCents : actual.tier4UnitCents,
  };
  const tiersError = validateMarkingTiers(resultante);
  if (tiersError) {
    return NextResponse.json({ error: tiersError }, { status: 400 });
  }
  try {
    const rule = await prisma.supplierMarkingRule.update({ where: { id }, data });
    return NextResponse.json({ ok: true, rule });
  } catch {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.supplierMarkingRule.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
