import { describe, it, expect } from "vitest";
import { refsDeProveedorEnTexto } from "./supplier-ref-en-descripcion";

/**
 * Los casos vienen de lo MEDIDO en el catálogo de producción el 2026-09-05, no
 * de ejemplos inventados: las formas reales en que el proveedor escribe sus
 * referencias dentro de la prosa, y los falsos positivos reales que hay que no
 * contar. Las referencias se conservan porque son exactamente lo que hay que
 * detectar; el test no las publica en ninguna superficie de cliente.
 */
const REFS = new Set(["T-1302", "T-1303", "Z-1205", "10101", "10402", "10400"]);

describe("refsDeProveedorEnTexto", () => {
  it("caza la referencia entre paréntesis, que es la forma más común", () => {
    const hits = refsDeProveedorEnTexto(
      'el modelo "Clásico" (T-1302) y el modelo "Halcón" (T-1303).',
      REFS,
      "T-1302",
    );
    expect(hits.map((h) => h.token)).toEqual(["T-1302", "T-1303"]);
  });

  it("distingue la referencia PROPIA de la de otro artículo del proveedor", () => {
    const hits = refsDeProveedorEnTexto(
      'el modelo "Clásico" (T-1302) y el modelo "Halcón" (T-1303).',
      REFS,
      "T-1302",
    );
    expect(hits.find((h) => h.token === "T-1302")?.propia).toBe(true);
    expect(hits.find((h) => h.token === "T-1303")?.propia).toBe(false);
    // Y por eso un filtro por la ref propia no bastaría: la mitad de lo medido
    // son referencias de OTRO producto del mismo catálogo.
  });

  it("caza la referencia numérica anunciada como «ref.»", () => {
    const hits = refsDeProveedorEnTexto("medida 16x21,5 cm y ref. 10101 medida 19x25 cm", REFS, "10101");
    expect(hits.map((h) => h.token)).toEqual(["10101"]);
  });

  it("caza la referencia pegada al texto, sin separador limpio", () => {
    const hits = refsDeProveedorEnTexto("SUPER KING 46 x 16 x 49 CMZ-1205 BOLSA PAPEL TOWER", REFS, "Z-1205");
    expect(hits.map((h) => h.token)).toEqual(["Z-1205"]);
  });

  it("caza la referencia aunque le siga un guion (medida o variante)", () => {
    // Los dos casos son del catálogo real: un primer borrador los descartaba
    // por cortar en el guion, y son fugas de las buenas — el cliente lee la
    // referencia entera.
    const refs = new Set(["T-484", "T-161"]);
    expect(
      refsDeProveedorEnTexto("Disponible en tres tamaños:T-484- 32,5 x 23,5 x 12 cm", refs, "T-484").map((h) => h.token),
    ).toEqual(["T-484"]);
    expect(
      refsDeProveedorEnTexto("Disponible en dos modelos Ref. T-161-MD, este modelo", refs, "T-161").map((h) => h.token),
    ).toEqual(["T-161"]);
  });

  it("NO cuenta un número de norma técnica, aunque exista como referencia", () => {
    // Medido: 16 de las 155 coincidencias del catálogo eran esto. Contarlas
    // convierte la vigilancia en ruido, y el ruido se acaba ignorando.
    const refs = new Set(["20471", "22196", "20743"]);
    expect(refsDeProveedorEnTexto("cumple las normativas CE ISO 20471 y EN 343.", refs, null)).toEqual([]);
    expect(refsDeProveedorEnTexto("de acuerdo al estándar ISO 22196, que determina", refs, null)).toEqual([]);
    expect(refsDeProveedorEnTexto("según UNE 20743 para la actividad", refs, null)).toEqual([]);
  });

  it("NO cuenta un número que no existe como referencia del proveedor", () => {
    // El cruce contra el catálogo es lo que quita los falsos positivos por
    // combinatoria: sin él, cualquier medida de 5 dígitos sería una fuga.
    expect(refsDeProveedorEnTexto("tirada mínima de 50000 unidades", REFS, null)).toEqual([]);
  });

  it("NO cuenta un token que es parte de una palabra o de un número mayor", () => {
    expect(refsDeProveedorEnTexto("referencia 101010 del lote", new Set(["10101"]), null)).toEqual([]);
    expect(refsDeProveedorEnTexto("modelo T-1302B revisado", new Set(["T-1302"]), null)).toEqual([]);
  });

  it("no repite la misma referencia citada dos veces", () => {
    const hits = refsDeProveedorEnTexto("ref. 10101 y otra vez ref. 10101", REFS, "10101");
    expect(hits).toHaveLength(1);
  });

  it("no arrastra el lastIndex del regex global entre llamadas", () => {
    // El bug que costó un ciclo el 2026-09-02 al extraer el escáner de fugas:
    // un regex `g` compartido empieza donde acabó la vez anterior.
    const texto = "ref. 10402 en A5";
    expect(refsDeProveedorEnTexto(texto, REFS, null)).toHaveLength(1);
    expect(refsDeProveedorEnTexto(texto, REFS, null)).toHaveLength(1);
  });

  it("aguanta texto vacío o ausente", () => {
    expect(refsDeProveedorEnTexto(null, REFS, null)).toEqual([]);
    expect(refsDeProveedorEnTexto("", REFS, null)).toEqual([]);
  });
});
