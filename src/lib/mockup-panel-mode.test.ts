import { describe, it, expect } from "vitest";
import { decideMockupPanelMode, mockupPanelHeading } from "./mockup-panel-mode";

describe("decideMockupPanelMode", () => {
  it("con zonas de marcaje: panel completo (previsualización + petición)", () => {
    expect(decideMockupPanelMode(1)).toBe("completo");
    expect(decideMockupPanelMode(4)).toBe("completo");
  });

  it("REGRESIÓN 14-ago: sin zonas de marcaje NO desaparece el panel, queda la petición", () => {
    // El fallo original: `if (positions.length === 0) return null` se llevaba por
    // delante también el formulario de «te lo hacemos nosotros», dejando 613 fichas
    // activas prometiendo un boceto gratis sin ningún sitio donde pedirlo.
    expect(decideMockupPanelMode(0)).toBe("solo-peticion");
  });

  it("ante un recuento imposible, la vía que siempre funciona", () => {
    for (const basura of [-1, NaN, Infinity, 0.5]) {
      expect(decideMockupPanelMode(basura)).toBe("solo-peticion");
    }
  });

  it("nunca devuelve un modo que oculte el panel entero", () => {
    // La invariante de negocio: mientras la ficha prometa el boceto gratis, tiene
    // que existir una vía de pedirlo, sea cual sea el número de zonas.
    for (const n of [0, 1, 2, 7, -3, NaN]) {
      expect(["completo", "solo-peticion"]).toContain(decideMockupPanelMode(n));
    }
  });
});

describe("mockupPanelHeading", () => {
  it("sin zonas NO promete una simulación visual que no puede hacer", () => {
    const h = mockupPanelHeading("solo-peticion");
    expect(h.title.toLowerCase()).not.toContain("sube tu logo");
    expect(h.body.toLowerCase()).toContain("no tiene zonas de marcaje");
    // Pero sí mantiene la promesa que hace la ficha: boceto gratis y aprobación previa.
    expect(h.kicker.toLowerCase()).toContain("gratis");
    expect(h.body.toLowerCase()).toContain("apruebes");
  });

  it("con zonas mantiene el aviso de que la previsualización es aproximada", () => {
    const h = mockupPanelHeading("completo");
    expect(h.body.toLowerCase()).toContain("aproximada");
    expect(h.title.toLowerCase()).toContain("sube tu logo");
  });

  it("ningún texto nombra al proveedor", () => {
    // Va a superficie pública: la regla dura de este proyecto aplica igual aquí.
    for (const mode of ["completo", "solo-peticion"] as const) {
      const t = JSON.stringify(mockupPanelHeading(mode)).toLowerCase();
      for (const termino of ["midocean", "makito", "supplierref", "adivin"]) {
        expect(t).not.toContain(termino);
      }
    }
  });
});
