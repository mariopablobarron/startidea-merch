/**
 * `/api/mockup-request` es una ruta PÚBLICA: sin sesión ni secreto, sólo rate
 * limit por IP. Lo que llega se persiste en `MockupRequest` y además viaja a
 * dos emails (cliente y buzón interno) y a Telegram.
 *
 * `productSlug` y `positionId` no tenían `.max()` ninguno. El primero importa
 * el doble: cuando el slug NO resuelve a un producto real se guarda crudo y se
 * usa como nombre de producto en los dos emails.
 *
 * Los topes salen de medir producción (19-ago-2026): slug más largo 80 sobre
 * 9.626 productos; `positionId` más largo 50 sobre 22.937 `MarkingPosition`
 * (sólo 13 pasan de 40, ninguna de 50).
 *
 * Los casos fijan los topes con LITERALES, nunca derivados de la constante:
 * un test que se calcula a partir de lo que vigila no vigila nada.
 */
import { describe, it, expect } from "vitest";
import { MockupRequestSchema } from "./mockup-request-schema";
import { MAX_SLUG, MAX_POSITION_ID } from "./cart-item-schema";

/** Petición con la forma que manda hoy el formulario de la ficha de producto. */
function peticion(over: Record<string, unknown> = {}) {
  return {
    productSlug: "cottonel-2",
    positionId: "FRONT",
    name: "Ana Ruiz",
    email: "ana@empresa.es",
    company: "Empresa SL",
    phone: "600111222",
    brief: "Logo a dos tintas en el pecho.",
    sourceUrl: "https://merchandising.startidea.es/catalogo/cottonel-2",
    ...over,
  };
}

describe("MockupRequestSchema", () => {
  it("acepta la petición real que manda el formulario", () => {
    expect(MockupRequestSchema.safeParse(peticion()).success).toBe(true);
  });

  it("los topes son los medidos, fijados con literales", () => {
    expect(MAX_SLUG).toBe(160);
    expect(MAX_POSITION_ID).toBe(60);
  });

  it("rechaza un productSlug absurdo pase lo que pase con la constante", () => {
    const r = MockupRequestSchema.safeParse(peticion({ productSlug: "s".repeat(5000) }));
    expect(r.success).toBe(false);
  });

  it("rechaza un positionId absurdo pase lo que pase con la constante", () => {
    const r = MockupRequestSchema.safeParse(peticion({ positionId: "P".repeat(5000) }));
    expect(r.success).toBe(false);
  });

  it("acepta el slug más largo del catálogo real (80) y el positionId más largo (50)", () => {
    const r = MockupRequestSchema.safeParse(
      peticion({ productSlug: "s".repeat(80), positionId: "P".repeat(50) }),
    );
    expect(r.success).toBe(true);
  });

  it("sigue exigiendo lo que ya exigía: slug no vacío, email válido, nombre mínimo", () => {
    expect(MockupRequestSchema.safeParse(peticion({ productSlug: "" })).success).toBe(false);
    expect(MockupRequestSchema.safeParse(peticion({ email: "no-es-email" })).success).toBe(false);
    expect(MockupRequestSchema.safeParse(peticion({ name: "A" })).success).toBe(false);
  });

  it("positionId sigue siendo opcional: la petición sin zona es legítima", () => {
    const r = MockupRequestSchema.safeParse(peticion({ positionId: null }));
    expect(r.success).toBe(true);
  });
});
