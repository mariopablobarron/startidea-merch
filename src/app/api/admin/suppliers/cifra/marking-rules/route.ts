import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { listDistinctMarkingHintsForSupplier } from "@/lib/supplier-marking-rules";

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
