/**
 * `/api/proposal/send` es una ruta PÚBLICA: no hay sesión, sólo un rate limit
 * de 5 peticiones por IP cada 10 minutos. Quien llama controla el cuerpo
 * entero, y ese cuerpo se renderiza a PDF y se persiste en una columna JSON.
 *
 * Antes de esto, ningún string del item tenía `.max()`: un `description` de
 * 5 MB pasaba la validación. Estos tests fijan el tope por TAMAÑO — nunca por
 * contenido, que rompería una venta legítima por un falso positivo.
 */
import { describe, it, expect } from "vitest";
import { BodySchema } from "./proposal-send-schema";

/** Item mínimo válido, con la forma que envía hoy el recomendador. */
function item(over: Record<string, unknown> = {}) {
  return {
    description: "Camiseta algodón 190g",
    notFound: false,
    quantity: 100,
    technique: "serigrafia",
    colorRequested: "azul marino",
    product: {
      slug: "camiseta-basica",
      name: "Camiseta básica",
      ref: "STM-1234",
      url: "https://merchandising.startidea.es/catalogo/camiseta-basica",
      primaryImageUrl: "/api/m/abc123",
    },
    unitPriceCents: 350,
    markingPerUnitCents: 40,
    markingSetupCents: 2500,
    totalCents: 41500,
    priceSource: "tier" as const,
    ...over,
  };
}

const body = (items: unknown[]) => ({
  email: "cliente@ejemplo.es",
  name: "Cliente",
  company: "Ejemplo SL",
  quoteItems: items,
});

describe("BodySchema de /api/proposal/send", () => {
  it("acepta una propuesta real del recomendador", () => {
    expect(BodySchema.safeParse(body([item()])).success).toBe(true);
  });

  it("rechaza un description desmesurado (era el agujero: 5 MB pasaban)", () => {
    const r = BodySchema.safeParse(body([item({ description: "A".repeat(5 * 1024 * 1024) })]));
    expect(r.success).toBe(false);
  });

  it.each([
    ["searchedAs", 200],
    ["rationale", 800],
    ["technique", 60],
    ["colorRequested", 80],
  ])("acota %s en %i caracteres", (campo, tope) => {
    expect(BodySchema.safeParse(body([item({ [campo]: "x".repeat(tope) })])).success).toBe(true);
    expect(BodySchema.safeParse(body([item({ [campo]: "x".repeat(tope + 1) })])).success).toBe(false);
  });

  it("acota también los campos del producto anidado", () => {
    const largo = (campo: string, n: number) =>
      BodySchema.safeParse(body([item({ product: { ...item().product, [campo]: "x".repeat(n) } })])).success;
    expect(largo("url", 500)).toBe(true);
    expect(largo("url", 501)).toBe(false);
    expect(largo("name", 201)).toBe(false);
    expect(largo("ref", 61)).toBe(false);
  });

  it("los topes dejan holgura sobre lo que hay hoy en producción (46 car. el mayor)", () => {
    // Medido el 18-ago-2026 sobre las 12 propuestas reales: el `quoteItems`
    // entero más grande son 688 bytes. Si algún día un caso legítimo roza el
    // tope, este test es el sitio donde subirlo a conciencia.
    expect(BodySchema.safeParse(body([item({ description: "A".repeat(400) })])).success).toBe(true);
  });
});
