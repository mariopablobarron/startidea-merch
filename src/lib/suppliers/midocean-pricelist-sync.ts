import { prisma } from "@/lib/prisma";
import { midoceanClient } from "./midocean";

/**
 * Sync print pricelist (tarifa de marcaje) y product pricelist desde MidOcean.
 *
 * - Print pricelist → MarkingTechnique (extender), MarkingPriceScale, PrintManipulation
 * - Product pricelist → ProductVariant.priceTiers via PriceTier
 *
 * Idempotente. Sustituye la tarifa anterior si hay una nueva versión.
 */

type MidoceanPrintPricelist = {
  currency: string;
  pricelist_valid_from: string;
  pricelist_valid_until: string;
  print_manipulations: Array<{ code: string; description: string; price: string }>;
  print_techniques: Array<{
    id: string;
    description: string;
    pricing_type: "NumberOfPositions" | "AreaRange" | "Area" | "NumberOfColours" | "ColourAreaRange";
    setup: string;
    setup_repeat?: string;
    next_colour_cost_indicator?: string;
    var_costs: Array<{
      range_id?: string;
      area_from?: string;
      area_to?: string;
      scales: Array<{ minimum_quantity: string; price: string; next_price?: string }>;
    }>;
  }>;
};

type MidoceanProductPricelist = {
  currency: string;
  date?: string;
  pricelist_valid_from?: string;
  pricelist_valid_until?: string;
  // Formato real (verificado 2026-05-15): array bajo data.price con
  // sku + variant_id + price + valid_until. Sin scales escalonadas.
  price?: Array<{
    sku?: string;
    variant_id?: string;
    price?: string;
    valid_until?: string;
  }>;
  // Formato legacy / esperado: products bajo otra estructura
  products?: Array<{
    sku?: string;
    master_code?: string;
    price?: string;
    valid_until?: string;
    scales?: Array<{ minimum_quantity: string; price: string }>;
  }>;
};

function eurStringToCents(s: string | undefined | null): number {
  if (s == null) return 0;
  // MidOcean usa coma decimal: "0,52" → 52 céntimos
  // O "1.000,50" → 100050 céntimos
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function intFromQty(s: string | undefined): number {
  if (!s) return 1;
  const cleaned = s.replace(/[.,]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Área en cm² del feed — MISMO formato europeo que los precios: punto =
 * millares, coma = decimal. El sentinel del rango superior llega como
 * "999.999" (= 999999, infinito del feed); parseFloat lo leía como ~1.000 cm²
 * → cualquier espalda de sudadera (1.120 cm²) quedaba FUERA de todos los
 * rangos y el marcaje cotizaba 0 € (auditoría 2026-07-09).
 */
function parseAreaCm2(s: string | undefined | null): number | null {
  if (s == null || s === "") return null;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type MidoceanPrintSyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  manipulationsUpserted: number;
  techniquesUpdated: number;
  scalesUpserted: number;
  validFrom?: string;
  validUntil?: string;
  errors: string[];
};

export async function syncMidoceanPrintPricelist(): Promise<MidoceanPrintSyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let manipulationsUpserted = 0;
  let techniquesUpdated = 0;
  let scalesUpserted = 0;

  const data = (await midoceanClient.fetchPrintPricelist()) as MidoceanPrintPricelist;

  // 1) Manipulations
  for (const m of data.print_manipulations) {
    try {
      await prisma.printManipulation.upsert({
        where: { code: m.code },
        create: {
          code: m.code,
          description: m.description,
          unitCostCents: eurStringToCents(m.price),
        },
        update: {
          description: m.description,
          unitCostCents: eurStringToCents(m.price),
          updatedAt: new Date(),
        },
      });
      manipulationsUpserted++;
    } catch (e) {
      errors.push(`manipulation ${m.code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2) Techniques + scales
  // Borramos scales viejos por técnica (más simple que diff por minQty/range)
  for (const t of data.print_techniques) {
    try {
      // Asegurar que la técnica existe (si printdata sync aún no la creó)
      await prisma.markingTechnique.upsert({
        where: { code: t.id },
        create: {
          code: t.id,
          name: t.description, // si no hay traducción ES, queda EN. midocean-sync la traduce luego.
          description: t.description,
          pricingType: t.pricing_type,
          setupCents: eurStringToCents(t.setup),
          setupRepeatCents: t.setup_repeat ? eurStringToCents(t.setup_repeat) : null,
          hasNextColour: t.next_colour_cost_indicator === "true",
        },
        update: {
          description: t.description,
          pricingType: t.pricing_type,
          setupCents: eurStringToCents(t.setup),
          setupRepeatCents: t.setup_repeat ? eurStringToCents(t.setup_repeat) : null,
          hasNextColour: t.next_colour_cost_indicator === "true",
        },
      });
      techniquesUpdated++;

      // Reset scales y recrear — en UNA transacción: entre el deleteMany y el
      // último create la técnica quedaba SIN tramos (ventana de "marcaje a
      // 0€", patrón de incidente ya sufrido). Atómico = o tarifa vieja o nueva.
      const scaleRows = t.var_costs.flatMap((v) =>
        v.scales.map((s) => ({
          techniqueCode: t.id,
          rangeId: v.range_id || null,
          areaFromCm2: parseAreaCm2(v.area_from),
          areaToCm2: parseAreaCm2(v.area_to),
          minQty: intFromQty(s.minimum_quantity),
          unitCostCents: eurStringToCents(s.price),
          nextColourCostCents: s.next_price ? eurStringToCents(s.next_price) : null,
        })),
      );
      await prisma.$transaction([
        prisma.markingPriceScale.deleteMany({ where: { techniqueCode: t.id } }),
        prisma.markingPriceScale.createMany({ data: scaleRows }),
      ]);
      scalesUpserted += scaleRows.length;
    } catch (e) {
      errors.push(`technique ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3) Snapshot
  const validFrom = data.pricelist_valid_from ? new Date(data.pricelist_valid_from) : startedAt;
  const validUntil = data.pricelist_valid_until && data.pricelist_valid_until !== "9999-12-31"
    ? new Date(data.pricelist_valid_until)
    : null;
  await prisma.markingPricelistSync.upsert({
    where: { supplier: "midocean" },
    create: {
      supplier: "midocean",
      validFrom,
      validUntil,
      currency: data.currency,
      techniquesCount: techniquesUpdated,
      scalesCount: scalesUpserted,
    },
    update: {
      validFrom,
      validUntil,
      currency: data.currency,
      fetchedAt: new Date(),
      techniquesCount: techniquesUpdated,
      scalesCount: scalesUpserted,
    },
  });

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ok: errors.length === 0,
    manipulationsUpserted,
    techniquesUpdated,
    scalesUpserted,
    validFrom: data.pricelist_valid_from,
    validUntil: data.pricelist_valid_until,
    errors: errors.slice(0, 30),
  };
}

export type MidoceanProductPriceSyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  variantsUpdated: number;
  errors: string[];
};

export async function syncMidoceanProductPricelist(): Promise<MidoceanProductPriceSyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let variantsUpdated = 0;

  const data = (await midoceanClient.fetchProductPricelist()) as MidoceanProductPricelist;

  // Feed real de MidOcean usa data.price (verificado 2026-05-15).
  // Mantenemos data.products como fallback por si en futuro cambia.
  const items = Array.isArray(data)
    ? data
    : data.price || data.products || [];

  for (const item of items as Array<{ sku?: string; price?: string; scales?: Array<{ minimum_quantity: string; price: string }> }>) {
    if (!item.sku) continue;

    // Encontrar variant por sku
    const variant = await prisma.productVariant.findUnique({ where: { sku: item.sku }, select: { id: true } });
    if (!variant) continue;

    // Borrar tiers anteriores y recrear
    await prisma.priceTier.deleteMany({ where: { variantId: variant.id } });

    const scales = item.scales && item.scales.length
      ? item.scales
      : item.price
        ? [{ minimum_quantity: "1", price: item.price }]
        : [];

    for (const s of scales) {
      try {
        await prisma.priceTier.create({
          data: {
            variantId: variant.id,
            minQty: intFromQty(s.minimum_quantity),
            unitPriceCents: eurStringToCents(s.price),
            source: "MIDOCEAN_PRICELIST",
          },
        });
      } catch (e) {
        errors.push(`tier ${item.sku} qty=${s.minimum_quantity}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    variantsUpdated++;
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ok: errors.length === 0,
    variantsUpdated,
    errors: errors.slice(0, 30),
  };
}
