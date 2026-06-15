/**
 * Tests de resolveTechniqueId — el mapeo robusto ref → técnica con tarifa que
 * arregla de raíz el incidente 2026-06-15 (productos Makito enlazados a técnicas
 * sin tarifa por capturar solo 1 ref por código).
 *
 * Mockeamos prisma/proxy-image para poder importar la función pura sin tocar BD.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/proxy-image", () => ({ ensureMediaAsset: vi.fn() }));

import { resolveTechniqueId } from "./makito-marking-enrich";

describe("resolveTechniqueId", () => {
  // Todas las variantes de ref del código F apuntan a MK_F (precios idénticos,
  // verificado contra la API de Makito 2026-06-15).
  const refToCode = new Map([
    ["100116", "MK_F"],
    ["100216", "MK_F"],
    ["100316", "MK_F"],
    ["100400", "MK_L1"],
  ]);
  const idByCode = new Map([
    ["MK_F", "id-F"],
    ["MK_L1", "id-L1"],
  ]);
  const fallbackByRef = new Map([["999999", "id-legacy"]]);

  it("mapea cualquier ref de un código a la técnica limpia con tarifa", () => {
    expect(resolveTechniqueId("100116", refToCode, idByCode, fallbackByRef)).toBe("id-F");
    expect(resolveTechniqueId("100216", refToCode, idByCode, fallbackByRef)).toBe("id-F");
    expect(resolveTechniqueId("100316", refToCode, idByCode, fallbackByRef)).toBe("id-F");
    expect(resolveTechniqueId("100400", refToCode, idByCode, fallbackByRef)).toBe("id-L1");
  });

  it("cae al mapa legacy por description si el code no resuelve a técnica", () => {
    // code presente pero sin técnica en idByCode (ej. DTF sin tarifa) → fallback
    const orphanRefToCode = new Map([["555", "MK_DTF1"]]);
    const fb = new Map([["555", "id-fallback"]]);
    expect(resolveTechniqueId("555", orphanRefToCode, idByCode, fb)).toBe("id-fallback");
  });

  it("usa el fallback cuando el ref no está en el mapa de la API de tarifa", () => {
    expect(resolveTechniqueId("999999", refToCode, idByCode, fallbackByRef)).toBe("id-legacy");
  });

  it("devuelve undefined si no hay ni code ni fallback", () => {
    expect(resolveTechniqueId("000000", refToCode, idByCode, fallbackByRef)).toBeUndefined();
  });
});
