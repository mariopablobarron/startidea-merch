import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/promotions
 *   GET  → lista de promos (no paginada — se asumen pocas, <100)
 *   POST → crea una nueva (CEO o COMERCIAL)
 *
 * Validación con zod. slug auto-generado desde name si no se manda.
 */

const ScopeEnum = z.enum(["ALL", "CATEGORY", "BRAND", "TAG", "PRODUCT_LIST"]);
const KindEnum = z.enum(["PERCENT", "FIXED"]);

const CreateSchema = z
  .object({
    name: z.string().min(2).max(120),
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
      .optional(),
    description: z.string().max(2000).nullable().optional(),
    kind: KindEnum,
    value: z.number().int().positive().max(100_000_000),
    scope: ScopeEnum,
    targetIds: z.array(z.string().min(1)).default([]),
    startsAt: z.string().datetime().or(z.date()),
    endsAt: z.string().datetime().or(z.date()).nullable().optional(),
    active: z.boolean().default(true),
    badgeText: z.string().max(40).nullable().optional(),
    badgeColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Hex tipo #E63E73")
      .nullable()
      .optional(),
    displayInList: z.boolean().default(true),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.kind === "PERCENT" && (d.value < 1 || d.value > 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "PERCENT: 1–100",
      });
    }
    if (d.scope !== "ALL" && d.targetIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["targetIds"],
        message: `Scope ${d.scope} requiere al menos un target`,
      });
    }
  });

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const promotions = await prisma.promotion.findMany({
    orderBy: [{ active: "desc" }, { startsAt: "desc" }],
  });

  // Enriquecer con nombres de targets para que la UI pueda mostrarlos
  // sin tener que recargar (categorías y productos por id).
  const categoryIds = promotions
    .filter((p) => p.scope === "CATEGORY")
    .flatMap((p) => p.targetIds);
  const productIds = promotions
    .filter((p) => p.scope === "PRODUCT_LIST")
    .flatMap((p) => p.targetIds);

  const [categories, products] = await Promise.all([
    categoryIds.length > 0
      ? prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    productIds.length > 0
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true, internalRef: true },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ok: true,
    promotions,
    lookup: {
      categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      products: Object.fromEntries(
        products.map((p) => [p.id, { name: p.name, slug: p.slug, internalRef: p.internalRef }]),
      ),
    },
  });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
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

  const slug = d.slug || slugify(d.name);
  try {
    const promo = await prisma.promotion.create({
      data: {
        name: d.name,
        slug,
        description: d.description ?? null,
        kind: d.kind,
        value: d.value,
        scope: d.scope,
        targetIds: d.targetIds,
        startsAt: new Date(d.startsAt),
        endsAt: d.endsAt ? new Date(d.endsAt) : null,
        active: d.active,
        badgeText: d.badgeText ?? null,
        badgeColor: d.badgeColor ?? null,
        displayInList: d.displayInList,
        createdBy: session.email,
      },
    });
    return NextResponse.json({ ok: true, promotion: promo });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Ya existe una promoción con slug "${slug}"` },
        { status: 409 },
      );
    }
    throw err;
  }
}
