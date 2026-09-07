import { describe, it, expect } from "vitest";
import {
  barrerJergaMayorista,
  extracto,
  ANCLA_DESCUBRIMIENTO,
  CAMPOS_PUBLICOS,
} from "./audit-jerga-mayorista";

describe("barrerJergaMayorista", () => {
  it("señala la ficha sucia y dice en qué campo", () => {
    const r = barrerJergaMayorista([
      { slug: "limpia", shortDescription: "Carpa plegable de aluminio." },
      { slug: "sucia", shortDescription: "Exclusivamente para distribuidores." },
    ]);
    expect(r.slugsSucios).toEqual(["sucia"]);
    expect(r.sucios[0].campo).toBe("shortDescription");
    expect(r.sucios[0].hits.length).toBeGreaterThan(0);
  });

  it("no confunde el castellano legítimo con jerga: «diseño exclusivo» está limpio", () => {
    const r = barrerJergaMayorista([
      { slug: "exclusivo-ok", longDescription: "Un diseño exclusivo y una presentación exclusiva." },
    ]);
    expect(r.sucios).toEqual([]);
    // …pero SÍ queda contado como mirado de cerca, que es el dato que permite
    // decir «he revisado N», no «N de las que ya sabía».
    expect(r.camposLimpiosConAncla).toBe(1);
  });

  it("revisa los cinco campos públicos, no solo las descripciones", () => {
    const sucio = "Precio con 30% de margen para el distribuidor";
    for (const campo of CAMPOS_PUBLICOS) {
      const r = barrerJergaMayorista([{ slug: `s-${campo}`, [campo]: sucio }]);
      expect(r.sucios.map((h) => h.campo)).toEqual([campo]);
    }
  });

  it("el ancla NO filtra: una redacción sin vocabulario de ancla se detecta igual", () => {
    // El modo de fallo que este barrido existe para no repetir: si el ancla
    // decidiera a quién se mira, lo que no la contiene sería invisible.
    const r = barrerJergaMayorista([
      { slug: "sin-ancla", shortDescription: "Producto exclusivamente para rotulistas." },
    ]);
    expect(r.sucios).toHaveLength(1);
    expect(r.camposRevisados).toBe(1);
  });

  it("ignora campos vacíos o en blanco y los cuenta como no revisados", () => {
    const r = barrerJergaMayorista([
      { slug: "vacia", shortDescription: "", longDescription: null, material: "   " },
    ]);
    expect(r.camposRevisados).toBe(0);
    expect(r.sucios).toEqual([]);
  });

  it("cuenta fichas y campos por separado", () => {
    const r = barrerJergaMayorista([
      { slug: "a", name: "Carpa", shortDescription: "Aluminio" },
      { slug: "b", name: "Bandera" },
    ]);
    expect(r.fichas).toBe(2);
    expect(r.camposRevisados).toBe(3);
  });

  it("una ficha sucia en dos campos sale una vez en slugsSucios y dos en sucios", () => {
    const r = barrerJergaMayorista([
      {
        slug: "doble",
        shortDescription: "Exclusivamente para distribuidores.",
        longDescription: "Exclusivamente para distribuidores.",
      },
    ]);
    expect(r.sucios).toHaveLength(2);
    expect(r.slugsSucios).toEqual(["doble"]);
  });
});

describe("ANCLA_DESCUBRIMIENTO", () => {
  it("es ancha a propósito: engancha castellano inocente", () => {
    expect(ANCLA_DESCUBRIMIENTO.test("diseño exclusivo")).toBe(true);
    expect(ANCLA_DESCUBRIMIENTO.test("margen de la página")).toBe(true);
  });

  it("no engancha texto de producto normal", () => {
    expect(ANCLA_DESCUBRIMIENTO.test("Carpa plegable 3x3 de aluminio")).toBe(false);
  });

  it("no depende de mayúsculas ni de la flexión", () => {
    expect(ANCLA_DESCUBRIMIENTO.test("ROTULISTAS")).toBe(true);
    expect(ANCLA_DESCUBRIMIENTO.test("Distribuidores")).toBe(true);
  });
});

describe("extracto", () => {
  it("recorta alrededor de la coincidencia", () => {
    const texto = `${"a".repeat(200)} AGUJA ${"b".repeat(200)}`;
    const e = extracto(texto, "AGUJA");
    expect(e).toContain("AGUJA");
    expect(e.length).toBeLessThan(texto.length);
    expect(e.startsWith("…")).toBe(true);
    expect(e.endsWith("…")).toBe(true);
  });

  it("si no encuentra la aguja devuelve el principio, sin romperse", () => {
    expect(extracto("texto corto", "no-esta")).toBe("texto corto");
  });
});
