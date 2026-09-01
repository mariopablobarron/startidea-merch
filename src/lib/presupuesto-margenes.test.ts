import { describe, it, expect } from "vitest";
import {
  normalizarMargenes,
  margenDeFamilia,
  margenDeJerarquia,
  MARGENES_POR_DEFECTO,
} from "./presupuesto-margenes";

describe("normalizarMargenes — lo que hay en BD no puede tumbar el panel", () => {
  it("acepta un ajuste bien formado", () => {
    expect(normalizarMargenes({ pordefecto: 32, familias: { Vasos: 28 } })).toEqual({
      pordefecto: 32,
      familias: { vasos: 28 },
    });
  });

  it("descarta valores imposibles en vez de propagarlos al precio", () => {
    const m = normalizarMargenes({
      pordefecto: 120,
      familias: { textil: -5, vasos: 25, bolsas: "mucho" },
    });
    expect(m.pordefecto).toBe(30);
    expect(m.familias).toEqual({ vasos: 25 });
  });

  it("ante basura devuelve el 30 % del encargo", () => {
    for (const v of [null, undefined, 42, "x", []]) {
      expect(normalizarMargenes(v)).toEqual(MARGENES_POR_DEFECTO);
    }
  });
});

describe("margenDeFamilia", () => {
  const margenes = normalizarMargenes({ pordefecto: 30, familias: { "gran formato": 22, vasos: 28 } });

  it("usa el de la familia cuando lo hay", () => {
    expect(margenDeFamilia(margenes, "Vasos")).toBe(28);
    expect(margenDeFamilia(margenes, "GRAN FORMATO")).toBe(22);
  });

  it("no se pierde por una tilde", () => {
    const conTilde = normalizarMargenes({ pordefecto: 30, familias: { "escritura básica": 26 } });
    expect(margenDeFamilia(conTilde, "Escritura basica")).toBe(26);
  });

  it("devuelve null si la familia no está configurada o no se dice", () => {
    // null y no el por defecto: quien pregunta necesita distinguir «esta
    // familia vale 30» de «esta familia no tiene margen propio» para poder
    // seguir subiendo por el árbol de categorías.
    expect(margenDeFamilia(margenes, "mochilas")).toBeNull();
    expect(margenDeFamilia(margenes, null)).toBeNull();
  });
});

describe("margenDeJerarquia", () => {
  const margenes = normalizarMargenes({
    pordefecto: 30,
    familias: { bebida: 25, vasos: 28 },
  });

  it("manda lo más concreto: la hoja antes que la raíz", () => {
    expect(margenDeJerarquia(margenes, ["Vasos", "Bebida"])).toBe(28);
  });

  it("sube por el árbol cuando la hoja no tiene margen propio", () => {
    expect(margenDeJerarquia(margenes, ["Termos de acero", "Bebida"])).toBe(25);
  });

  it("cae al por defecto cuando no hay margen en toda la rama", () => {
    expect(margenDeJerarquia(margenes, ["Mochilas", "Viaje"])).toBe(30);
    expect(margenDeJerarquia(margenes, [])).toBe(30);
    expect(margenDeJerarquia(margenes, [null, undefined])).toBe(30);
  });
});
