/**
 * Tarifa de marcaje UNIFICADA — fuente única para ficha, checkout y cotizador.
 *
 * Cascada por tipo de técnica (auditoría de personalización 2026-07-09):
 *
 *   CIF_*  (técnicas virtuales de Cifra)
 *     → ProductMarkingPrice (tarifa REAL del PDF, por producto y tramo)
 *     → SupplierMarkingRule (markup % aproximado) con el código SIN prefijo
 *     → sin tarifa (ok:false — jamás cotizar con la escala dummy de 1,00 €/ud)
 *
 *   resto (MidOcean nativas + MK_* de Makito)
 *     → MarkingTechnique + MarkingPriceScale via calculateMarkingCost
 *     → si devuelve warning (sin tarifa / sin tramo / por-cm² sin área) → ok:false
 *
 * Devuelve COSTE NETO: el margen (applyMargin ×1,6) se aplica FUERA, igual que
 * hace cotizar-core. `ok:false` significa "sin tarifa fiable": la ficha muestra
 * cotización manual y el checkout de pago directo DEGRADA a presupuesto — nunca
 * se cobra un marcaje a 0 € en silencio.
 */
import { prisma } from "@/lib/prisma";
import { calculateMarkingCost } from "@/lib/marking-cost";
import { quoteMarkingForRule } from "@/lib/supplier-marking-rules";
import type { SupplierCode } from "@prisma/client";

export type MarkingNetQuote = {
  ok: boolean;
  /** Coste NETO total del marcaje del pedido (setup + variable). */
  netTotalCents: number;
  techniqueLabel: string;
  setupCents: number;
  source: "scales" | "product-tariff" | "rule" | "none";
  warning?: string;
};

export async function quoteMarkingNet(opts: {
  productId: string;
  supplier: SupplierCode;
  techniqueCode: string;
  quantity: number;
  /** Precio unitario NETO del producto al tramo (para reglas markup %). */
  productNetUnitCents: number;
  positionCount?: number;
  printAreaCm2?: number | null;
  numberOfColours?: number | null;
  manipulationCode?: string | null;
}): Promise<MarkingNetQuote> {
  const code = opts.techniqueCode.trim();

  if (code.toUpperCase().startsWith("CIF_")) {
    const strippedCode = code.slice(4).toUpperCase();
    const m = await quoteMarkingForRule({
      supplier: opts.supplier,
      techniqueCode: strippedCode,
      productId: opts.productId,
      productUnitPriceCents: opts.productNetUnitCents,
      qty: opts.quantity,
    });
    if (m) {
      return {
        ok: true,
        netTotalCents: m.totalMarkingCents,
        techniqueLabel: m.techniqueLabel,
        setupCents: m.setupCents,
        source: m.markupPct > 0 ? "rule" : "product-tariff",
      };
    }
    const tech = await prisma.markingTechnique.findUnique({
      where: { code },
      select: { name: true },
    });
    return {
      ok: false,
      netTotalCents: 0,
      techniqueLabel: tech?.name ?? code,
      setupCents: 0,
      source: "none",
      warning: "Técnica sin tarifa real registrada — pedir cotización manual.",
    };
  }

  // MidOcean nativas + MK_* Makito → tarifa por scales. El fee de manipulación
  // de archivo es un concepto MidOcean: para el resto se pasa null (sin fee).
  const isMidocean = opts.supplier === "midocean";
  const br = await calculateMarkingCost({
    techniqueCode: code,
    quantity: opts.quantity,
    positionCount: opts.positionCount,
    printAreaCm2: opts.printAreaCm2 ?? undefined,
    numberOfColours: opts.numberOfColours ?? undefined,
    manipulationCode: isMidocean ? (opts.manipulationCode ?? undefined) : null,
  });
  if (br.warning) {
    return {
      ok: false,
      netTotalCents: 0,
      techniqueLabel: br.techniqueName,
      setupCents: 0,
      source: "none",
      warning: br.warning,
    };
  }
  return {
    ok: true,
    netTotalCents: br.totalCostCents,
    techniqueLabel: br.techniqueName,
    setupCents: br.setupCents,
    source: "scales",
  };
}
