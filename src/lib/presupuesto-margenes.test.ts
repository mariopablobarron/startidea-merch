import { describe, it, expect } from "vitest";
import {
  normalizarMargenes,
  margenDeFamilia,
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

  it("cae al por defecto si la familia no está o no se dice", () => {
    expect(margenDeFamilia(margenes, "mochilas")).toBe(30);
    expect(margenDeFamilia(margenes, null)).toBe(30);
  });
});
