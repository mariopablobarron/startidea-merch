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
 * Devuelve COSTE NETO: el margen (applyMargin ×1,6667) se aplica FUERA, igual que
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

/**
 * Último cerrojo del invariante de dinero que promete la cabecera de este módulo:
 * una cotización de marcaje que sale con `ok:true` vale MÁS de 0 €.
 *
 * Hasta ahora el invariante lo sostenían las fuentes de tarifa una por una, y el
 * consumidor (`quote-server-pricing`) solo miraba `ok`. Con la tarifa por tramos
 * (`73f5518`) el importe pasa a teclearse en el admin, así que un 0 —o un NaN por
 * un tramo a medio rellenar— llegaría al cobro como marcaje gratis. Aquí se
 * degrada a "sin tarifa fiable", que es el camino que ya existe y que convierte
 * el pago directo en presupuesto: dirección conservadora, nunca cobrar de menos.
 *
 * Puro y exportado para poder testearlo sin Prisma.
 */
export function guardNonZeroMarking(q: MarkingNetQuote): MarkingNetQuote {
  if (!q.ok) return q;
  if (Number.isFinite(q.netTotalCents) && q.netTotalCents > 0) return q;
  return {
    ok: false,
    netTotalCents: 0,
    techniqueLabel: q.techniqueLabel,
    setupCents: 0,
    source: "none",
    warning:
      "Tarifa de marcaje incompleta (importe 0) — revisar los tramos de la técnica; pedir cotización manual.",
  };
}

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
      return guardNonZeroMarking({
        ok: true,
        netTotalCents: m.totalMarkingCents,
        techniqueLabel: m.techniqueLabel,
        setupCents: m.setupCents,
        source: m.markupPct > 0 ? "rule" : "product-tariff",
      });
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
  return guardNonZeroMarking({
    ok: true,
    netTotalCents: br.totalCostCents,
    techniqueLabel: br.techniqueName,
    setupCents: br.setupCents,
    source: "scales",
  });
}
