/**
 * Red de COMPORTAMIENTO sobre el PDF que recibe el cliente.
 *
 * Ya existe `ProposalVariantVisibility.guard.test.ts`, pero es un guard
 * ESTÁTICO: lee el fuente del componente y comprueba que llama a
 * `proposalVariantCustomerLabel` y que `{variantLabel}` aparece dos veces.
 * Eso vigila el CABLEADO y no ve la salida — si mañana alguien añade una
 * columna nueva que pinte `variantSelection.summary` (que lleva el SKU del
 * proveedor por diseño, para revisión comercial), el guard sigue en verde y
 * el SKU se imprime en el PDF del cliente.
 *
 * Aquí se renderiza el PDF de verdad con `renderToBuffer` —el mismo camino
 * que `/api/proposal/[number]/pdf` y que el email— y se escanea el texto
 * resultante. Es la única forma de afirmar algo sobre lo que el cliente ve.
 *
 * El caso de `primaryImageUrl` no es hipotético: el 17-ago-2026 se midió en
 * producción que 1 de 12 propuestas (PROP-2026-0002, del 25-jun, enviada y
 * abierta) guarda una URL de `cdn1.midocean.com` en esa clave. Hoy no llega
 * al cliente porque este PDF no pinta imágenes; el día que se añada una
 * miniatura de producto, sí. Ver la fuga real del 2026-07-20.
 */
import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { RecommenderProposalPdf } from "./recommender-proposal-pdf";
import { findSupplierLeak } from "./supplier-leak-terms";
import { PUBLIC_SUPPLIER_LEAK_PATTERNS } from "./public-supplier-leak-patterns";
import type { ProposalQuoteItem } from "./proposal-types";

/**
 * Texto visible de un PDF de @react-pdf/renderer.
 *
 * Dos filos, y los dos firman "limpio" sobre una fuga real si se pasan por
 * alto: (1) los streams van comprimidos con FlateDecode, así que sin inflar
 * no se lee nada; (2) dentro del array de un operador TJ los glifos vienen en
 * hex separados por números de KERNING — concatenar sin descartarlos parte
 * las palabras ("MO6104" queda como "MO" + "6104" y un `includes` falla).
 * Por eso el test lleva un control positivo obligatorio (abajo).
 */
function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  let streams = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const chunk = Buffer.from(m[1], "latin1");
    try {
      streams += inflateSync(chunk).toString("latin1") + "\n";
    } catch {
      streams += chunk.toString("latin1") + "\n";
    }
  }
  return streams.replace(/\[([^\]]*)\]\s*TJ/g, (_, body: string) => {
    let s = "";
    for (const g of body.matchAll(/<([0-9a-fA-F]+)>/g)) {
      const hex = g[1].length % 2 ? g[1] + "0" : g[1];
      s += Buffer.from(hex, "hex").toString("latin1");
    }
    return s + "\n";
  });
}

const SKU_PROVEEDOR = "MO6104-05";
const CDN_PROVEEDOR = "https://cdn1.midocean.com/image/700X700/s11.jpg";

function item(overrides: Partial<ProposalQuoteItem> = {}): ProposalQuoteItem {
  return {
    description: "Polo técnico personalizado",
    notFound: false,
    quantity: 50,
    sizes: { m: 25, l: 25 },
    technique: "serigrafia",
    colorRequested: "Rojo",
    product: {
      slug: "polo-street",
      name: "Polo Street",
      ref: "STM-2Q3DXV",
      url: "https://merchandising.startidea.es/catalogo/polo-street",
      // La clave donde se midió la fuga en reposo en producción.
      primaryImageUrl: CDN_PROVEEDOR,
    },
    unitPriceCents: 1200,
    markingPerUnitCents: 150,
    markingSetupCents: 2500,
    totalCents: 70000,
    priceSource: "tier",
    // `summary` lleva el SKU por diseño: el equipo comercial lo necesita para
    // cursar el pedido (`proposalVariantAdminLabel`). El PDF del cliente tiene
    // que quedarse solo con color y talla.
    variantSelection: {
      summary: `25× ${SKU_PROVEEDOR} · Rojo · talla M · 25× MO6104-06 · Rojo · talla L`,
      variantSku: SKU_PROVEEDOR,
      colorName: "Rojo",
      size: "M",
      variantLines: [
        { sku: SKU_PROVEEDOR, colorName: "Rojo", size: "M", quantity: 25 },
        { sku: "MO6104-06", colorName: "Rojo", size: "L", quantity: 25 },
      ],
    },
    ...overrides,
  };
}

/**
 * El PDF tiene DOS layouts de línea y hay que ejercitar los dos: con
 * `breakdown` pinta producto / marcaje / cliché / envío en filas propias
 * (petición de Mario del 11-ago, y lo que llevan todas las propuestas
 * nuevas); sin él, la línea todo-incluido de las antiguas. Cada uno repite el
 * bloque de variante por su cuenta — una mutación que ensuciara solo el
 * primero pasaba inadvertida con un único caso de prueba.
 */
function itemConDesglose(overrides: Partial<ProposalQuoteItem> = {}): ProposalQuoteItem {
  return item({
    breakdown: {
      productUnitCents: 1200,
      productTotalCents: 60000,
      markingUnitCents: 150,
      markingTotalCents: 7500,
      setupCents: 2500,
      shippingCents: 0,
      discountCents: 0,
    },
    ...overrides,
  });
}

async function renderTexto(items: ProposalQuoteItem[]): Promise<string> {
  const buf = await renderToBuffer(
    // Mismo casteo que /api/proposal/[number]/pdf: el elemento se construye
    // igual que en producción, para que este test mida ese camino y no otro.
    createElement(RecommenderProposalPdf, {
      proposalNumber: "PROP-2026-9999",
      date: new Date("2026-01-15T00:00:00Z"),
      email: "cliente@example.com",
      name: "Cliente de prueba",
      company: "ACME SL",
      items,
      totals: { subtotalCents: 70000, ivaCents: 14700, totalCents: 84700 },
    }) as unknown as ReactElement<DocumentProps>,
  );
  return extractPdfText(Buffer.from(buf));
}

describe("el PDF de propuesta no delata al proveedor", () => {
  it("EL EXTRACTOR NO ESTÁ CIEGO: caza el SKU cuando el PDF sí lo imprime", async () => {
    // Control positivo obligatorio. Con `manualOverride`, `proposalLineLabel`
    // imprime `description` tal cual, así que este SKU SÍ tiene que salir. Si
    // este test se pusiera verde, los tres de abajo no probarían nada: un
    // extractor roto en la dirección contraria firma "limpio" siempre.
    const texto = await renderTexto([
      item({ manualOverride: true, description: `Polo ${SKU_PROVEEDOR} personalizado` }),
    ]);
    expect(texto).toContain(SKU_PROVEEDOR);
  }, 30_000);

  it.each([
    ["línea todo-incluido (propuestas antiguas)", item],
    ["desglose producto/marcaje/cliché/envío", itemConDesglose],
  ])("imprime color y talla de la variante, nunca su SKU — %s", async (_, build) => {
    const texto = await renderTexto([build()]);

    expect(texto).toContain("Rojo");
    expect(texto).toContain("talla M");
    expect(texto).not.toContain(SKU_PROVEEDOR);
    expect(texto).not.toContain("MO6104");
  }, 30_000);

  it.each([
    ["línea todo-incluido (propuestas antiguas)", item],
    ["desglose producto/marcaje/cliché/envío", itemConDesglose],
  ])("no imprime la URL del CDN del proveedor guardada en el producto — %s", async (_, build) => {
    const texto = await renderTexto([build()]);

    expect(texto).not.toContain("midocean");
    expect(texto).not.toContain("cdn1");
  }, 30_000);

  it("sale limpio ante el saneador y los canarios públicos del repo", async () => {
    // Se pasan los MISMOS detectores que vigilan el HTML público, en vez de
    // una lista propia que se desincronizaría en silencio: si mañana se añade
    // un proveedor a `supplier-leak-terms`, este test lo hereda.
    const texto = await renderTexto([
      item(),
      itemConDesglose(),
      item({ notFound: true, product: null }),
    ]);

    expect(findSupplierLeak(texto)).toBeNull();
    // `match` y no `test`: los patrones llevan el flag /g, así que `test`
    // arrastra `lastIndex` entre llamadas y el segundo patrón empezaría a
    // buscar donde acabó el primero. Recrear el RegExp lo evitaría también,
    // pero semgrep lo bloquea con razón (detect-non-literal-regexp) y aquí no
    // hace falta: con /g, `match` ignora y resetea `lastIndex`.
    const encontrados = PUBLIC_SUPPLIER_LEAK_PATTERNS.filter(
      (p) => texto.match(p.re) !== null,
    ).map((p) => p.code);
    expect(encontrados).toEqual([]);
  }, 30_000);
});
