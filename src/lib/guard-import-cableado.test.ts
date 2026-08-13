import { describe, expect, it } from "vitest";

import { colapsar, importaDesde } from "./guard-import-cableado";

/**
 * Tests del andamio que sostiene a los demás guards.
 *
 * Importan más de lo que parece: si `importaDesde` se vuelve permisiva, los
 * guards de cableado siguen pasando en verde mientras dejan de comprobar nada.
 * Los casos de abajo son, uno por uno, fallos que este repo ya ha sufrido.
 */
describe("importaDesde · el símbolo tiene que estar en la LISTA DE IMPORTACIÓN", () => {
  it("lo encuentra en un import normal", () => {
    const t = colapsar(`import { decidePortesPreload } from "@/lib/cotizar-portes-default";`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(true);
  });

  it("EL FALLO DEL 12-AGO: la llamada del cuerpo NO cuenta como import", () => {
    // Sin esto el guard se engañaba solo: el nombre aparecía en el fichero
    // (en la llamada) aunque el import hubiera desaparecido y el fichero ni
    // compilara.
    const t = colapsar(`
      const portes = decidePortesPreload({ cents: 100 });
      export default function Page() { return null; }
    `);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(false);
  });

  it("el mismo símbolo importado de OTRO módulo no vale", () => {
    // Reimplementarlo en otro sitio y tirar de ahí es justo lo que el guard
    // existe para impedir.
    const t = colapsar(`import { decidePortesPreload } from "./copia-local";`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(false);
  });

  it("encuentra el símbolo entre varios y con saltos de línea", () => {
    const t = colapsar(`import {
        buildSupplierShippingMap,
        decidePortesPreload,
      } from "@/lib/cotizar-portes-default";`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(true);
    expect(importaDesde(t, "buildSupplierShippingMap", "@/lib/cotizar-portes-default")).toBe(true);
  });

  it("un prefijo del nombre no cuela (`decide` no es `decidePortesPreload`)", () => {
    const t = colapsar(`import { decidePortesPreload } from "@/lib/cotizar-portes-default";`);
    expect(importaDesde(t, "decide", "@/lib/cotizar-portes-default")).toBe(false);
  });

  it("acepta comillas simples, `import type` y alias", () => {
    expect(
      importaDesde(colapsar(`import { proposalLineLabel } from '@/lib/proposal-types';`), "proposalLineLabel", "@/lib/proposal-types"),
    ).toBe(true);
    expect(
      importaDesde(colapsar(`import { type PublicQuoteSource } from "@/lib/public-quote-view";`), "PublicQuoteSource", "@/lib/public-quote-view"),
    ).toBe(true);
    expect(
      importaDesde(colapsar(`import { toPublicQuoteView as vista } from "@/lib/public-quote-view";`), "toPublicQuoteView", "@/lib/public-quote-view"),
    ).toBe(true);
  });

  it("un módulo que empieza igual no se confunde con el vigilado", () => {
    // `===` y no `startsWith`: "@/lib/cotizar-portes-default-legacy" es otro.
    const t = colapsar(`import { decidePortesPreload } from "@/lib/cotizar-portes-default-legacy";`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(false);
  });
});

describe("colapsar · lo comentado no cuenta y lo partido en dos líneas sí", () => {
  it("un import COMENTADO no cuenta como cableado", () => {
    const t = colapsar(`// import { decidePortesPreload } from "@/lib/cotizar-portes-default";`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(false);
  });

  it("un bloque /* */ tampoco", () => {
    const t = colapsar(`/* import { decidePortesPreload } from "@/lib/cotizar-portes-default"; */`);
    expect(importaDesde(t, "decidePortesPreload", "@/lib/cotizar-portes-default")).toBe(false);
  });
});
