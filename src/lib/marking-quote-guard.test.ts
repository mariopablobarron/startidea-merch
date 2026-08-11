import { describe, it, expect } from "vitest";
import { guardNonZeroMarking, type MarkingNetQuote } from "@/lib/marking-quote";

/**
 * El invariante que la cabecera de marking-quote.ts promete desde hace un mes y
 * que hasta ahora sostenían las fuentes de tarifa una a una: si sale `ok:true`,
 * el marcaje vale MÁS de 0 €. El consumidor de checkout solo mira `ok`, así que
 * este guard es lo único que separa una tarifa mal cargada de un cobro gratis.
 */
describe("guardNonZeroMarking", () => {
  const sano: MarkingNetQuote = {
    ok: true,
    netTotalCents: 4500,
    techniqueLabel: "Serigrafía 1 color",
    setupCents: 2000,
    source: "product-tariff",
  };

  it("deja pasar intacta una cotización con importe", () => {
    expect(guardNonZeroMarking(sano)).toEqual(sano);
  });

  it("deja pasar 1 céntimo (el límite es 0, no un mínimo inventado)", () => {
    const r = guardNonZeroMarking({ ...sano, netTotalCents: 1 });
    expect(r.ok).toBe(true);
    expect(r.netTotalCents).toBe(1);
  });

  it("degrada a presupuesto un marcaje a 0 € — nunca se cobra gratis", () => {
    const r = guardNonZeroMarking({ ...sano, netTotalCents: 0 });
    expect(r.ok).toBe(false);
    expect(r.netTotalCents).toBe(0);
    expect(r.source).toBe("none");
    expect(r.warning).toBeTruthy();
  });

  it("degrada un importe negativo (tramo tecleado con signo)", () => {
    expect(guardNonZeroMarking({ ...sano, netTotalCents: -300 }).ok).toBe(false);
  });

  it("degrada NaN — un tramo a medio rellenar propaga NaN, y NaN > 0 es false pero NaN entraba en el total", () => {
    const r = guardNonZeroMarking({ ...sano, netTotalCents: Number.NaN });
    expect(r.ok).toBe(false);
    expect(r.netTotalCents).toBe(0);
  });

  it("degrada Infinity", () => {
    expect(guardNonZeroMarking({ ...sano, netTotalCents: Number.POSITIVE_INFINITY }).ok).toBe(
      false,
    );
  });

  it("conserva la etiqueta de técnica al degradar (el aviso al admin debe decir cuál falla)", () => {
    const r = guardNonZeroMarking({ ...sano, netTotalCents: 0 });
    expect(r.techniqueLabel).toBe("Serigrafía 1 color");
  });

  it("no toca una cotización que ya venía en ok:false", () => {
    const fallida: MarkingNetQuote = {
      ok: false,
      netTotalCents: 0,
      techniqueLabel: "Láser",
      setupCents: 0,
      source: "none",
      warning: "Técnica sin tarifa real registrada — pedir cotización manual.",
    };
    expect(guardNonZeroMarking(fallida)).toEqual(fallida);
  });
});
