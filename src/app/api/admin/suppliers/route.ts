import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import {
  SUPPLIER_CODES,
  SUPPLIER_DEFAULT_NAMES,
  SupplierProfileSchema,
} from "@/lib/supplier-profile-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers
 *
 * Landing /admin/suppliers — ficha de cada proveedor (contacto, condiciones
 * comerciales) + estado en vivo de su catálogo (productos activos, última
 * sincronización) cruzando Supplier con Product/SupplierSync. Los 4 códigos
 * de SupplierCode aparecen SIEMPRE, tengan o no fila en Supplier todavía
 * (ficha vacía = "sin rellenar", no "no existe").
 */
const ALL_CODES = SUPPLIER_CODES;
const DEFAULT_NAMES = SUPPLIER_DEFAULT_NAMES;

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [suppliers, productCounts, syncs] = await Promise.all([
    prisma.supplier.findMany(),
    prisma.product.groupBy({
      by: ["supplier", "active"],
      _count: { _all: true },
    }),
    prisma.supplierSync.findMany(),
  ]);

  const bySupplier = new Map(suppliers.map((s) => [s.code, s]));
  const syncByCode = new Map(syncs.map((s) => [s.supplier, s]));

  const items = ALL_CODES.map((code) => {
    const s = bySupplier.get(code);
    const active = productCounts.find((p) => p.supplier === code && p.active)?._count._all ?? 0;
    const inactive = productCounts.find((p) => p.supplier === code && !p.active)?._count._all ?? 0;
    const sync = syncByCode.get(code);
    return {
      code,
      name: s?.name ?? DEFAULT_NAMES[code],
      active: s?.active ?? true,
      hasAutoSync: s?.hasAutoSync ?? code !== "adivin",
      contactName: s?.contactName ?? null,
      contactEmail: s?.contactEmail ?? null,
      contactPhone: s?.contactPhone ?? null,
      paymentTerms: s?.paymentTerms ?? null,
      minOrderNotes: s?.minOrderNotes ?? null,
      leadTimeDays: s?.leadTimeDays ?? null,
      defaultShippingCents: s?.defaultShippingCents ?? null,
      notes: s?.notes ?? null,
      hasProfile: !!s,
      productsActive: active,
      productsInactive: inactive,
      lastSyncAt: sync?.finishedAt ?? null,
      lastSyncOk: sync?.ok ?? null,
    };
  });

  return NextResponse.json({ ok: true, items });
}

/** PATCH crea la ficha si no existe (primera edición) o actualiza la existente. */
export async function PATCH(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = SupplierProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { code, ...data } = parsed.data;
  const supplier = await prisma.supplier.upsert({
    where: { code },
    create: { code, name: data.name ?? DEFAULT_NAMES[code], ...data, updatedBy: session.email },
    update: { ...data, updatedBy: session.email },
  });
  return NextResponse.json({ ok: true, supplier });
}
