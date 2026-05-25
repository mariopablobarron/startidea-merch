/**
 * Tarifa aproximada de marcaje para proveedores cuyo API NO da pricelist
 * estructurada (caso Cifra). Lee SupplierMarkingRule (markupPct + setupCents)
 * y calcula coste unitario + setup.
 *
 * MidOcean NO usa este path — su tarifa real vive en MarkingTechnique +
 * MarkingPriceScale. Solo enrutamos aquí para suppliers que no tengan ningún
 * MarkingPosition cargado (señal de "API sin estructura").
 */
import { prisma } from "@/lib/prisma";
import type { SupplierCode } from "@prisma/client";

export type MarkingRuleQuote = {
  techniqueCode: string;
  techniqueLabel: string;
  markupPct: number;
  unitMarkupCents: number; // markupPct % del precio unitario del producto
  setupCents: number; // setup fijo del pedido (0 si la técnica no aplica)
  totalMarkingCents: number; // setup + unitMarkupCents × qty
};

/**
 * Devuelve la lista de técnicas disponibles para un producto del proveedor
 * indicado, basándose en:
 *   - El hint `markingTechniqueHint` del producto (ej "A, DIGITAL")
 *   - Las reglas activas para ese supplier en SupplierMarkingRule
 *
 * Si el producto no tiene hint o no hay reglas → array vacío (UI muestra
 * solo "Pedir cotización" manual).
 */
export async function getAvailableMarkingRules(opts: {
  supplier: SupplierCode;
  markingTechniqueHint: string | null;
}): Promise<Array<{ techniqueCode: string; techniqueLabel: string; markupPct: number; setupCents: number | null }>> {
  if (!opts.markingTechniqueHint?.trim()) return [];
  const tokens = parseHintTokens(opts.markingTechniqueHint);
  if (tokens.length === 0) return [];

  const rules = await prisma.supplierMarkingRule.findMany({
    where: {
      supplier: opts.supplier,
      active: true,
      techniqueCode: { in: tokens },
    },
    orderBy: { markupPct: "asc" },
    select: {
      techniqueCode: true,
      techniqueLabel: true,
      markupPct: true,
      setupCents: true,
    },
  });
  return rules;
}

/**
 * Cotiza el coste de marcaje para una cantidad y técnica concreta.
 * Devuelve null si no hay regla activa para esa técnica.
 */
export async function quoteMarkingForRule(opts: {
  supplier: SupplierCode;
  techniqueCode: string;
  productUnitPriceCents: number;
  qty: number;
}): Promise<MarkingRuleQuote | null> {
  const rule = await prisma.supplierMarkingRule.findUnique({
    where: { supplier_techniqueCode: { supplier: opts.supplier, techniqueCode: opts.techniqueCode } },
  });
  if (!rule || !rule.active) return null;

  const unitMarkupCents = Math.round((opts.productUnitPriceCents * rule.markupPct) / 100);
  const setupCents = rule.setupCents ?? 0;
  const totalMarkingCents = setupCents + unitMarkupCents * Math.max(1, opts.qty);

  return {
    techniqueCode: rule.techniqueCode,
    techniqueLabel: rule.techniqueLabel,
    markupPct: rule.markupPct,
    unitMarkupCents,
    setupCents,
    totalMarkingCents,
  };
}

/**
 * Parsea el hint "A, DIGITAL" / "L, TR" en tokens limpios uppercase.
 * Quita espacios y duplicados, descarta strings vacíos.
 */
function parseHintTokens(hint: string): string[] {
  return Array.from(
    new Set(
      hint
        .split(/[,;/]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && s.length <= 10),
    ),
  );
}

/**
 * Helper para uso desde admin/import: extrae todos los códigos de técnica
 * únicos encontrados en los productos de un supplier. Útil para que el
 * admin sepa qué técnicas tiene que dar de alta como SupplierMarkingRule.
 */
export async function listDistinctMarkingHintsForSupplier(
  supplier: SupplierCode,
): Promise<Array<{ techniqueCode: string; productCount: number }>> {
  const products = await prisma.product.findMany({
    where: {
      supplier,
      markingTechniqueHint: { not: null },
    },
    select: { markingTechniqueHint: true },
  });
  const counts = new Map<string, number>();
  for (const p of products) {
    const tokens = parseHintTokens(p.markingTechniqueHint || "");
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([techniqueCode, productCount]) => ({ techniqueCode, productCount }))
    .sort((a, b) => b.productCount - a.productCount);
}
