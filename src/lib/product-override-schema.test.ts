import { describe, it, expect } from "vitest";
import { ProductOverrideSchema } from "./product-override-schema";

/**
 * La otra mitad del cerrojo del precio fijo a 0 €.
 *
 * `normalizePriceOverride` impide COBRARLO; esto impide GUARDARLO. Hacen falta
 * las dos: el 11-ago se comprobó por mutación que un cerrojo al cobrar no falla
 * ningún test si la casilla que guarda sigue aceptando el dato imposible, y la
 * primera versión de este arreglo tenía exactamente ese hueco — bajar el Zod de
 * `.min(1)` a `.min(0)` no rompía nada.
 */
describe("ProductOverrideSchema — precio fijo", () => {
  it("RECHAZA un precio fijo de 0 € (se cobraría el producto a 0 €)", () => {
    const r = ProductOverrideSchema.safeParse({ customFromPriceCents: 0 });
    expect(r.success).toBe(false);
  });

  it("RECHAZA un precio fijo negativo", () => {
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: -1 }).success).toBe(false);
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: -5000 }).success).toBe(false);
  });

  it("ACEPTA `null` — es como la UI quita el precio fijo", () => {
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: null }).success).toBe(true);
  });

  it("ACEPTA el céntimo más bajo que sí es un precio", () => {
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: 1 }).success).toBe(true);
  });

  it("ACEPTA un precio normal del catálogo vivo (5,57 €)", () => {
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: 557 }).success).toBe(true);
  });

  it("RECHAZA decimales y no-finitos (céntimos son enteros)", () => {
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: 12.5 }).success).toBe(false);
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: Infinity }).success).toBe(false);
    expect(ProductOverrideSchema.safeParse({ customFromPriceCents: NaN }).success).toBe(false);
  });

  it("RECHAZA un margen que hunde el precio a 0 o menos", () => {
    expect(ProductOverrideSchema.safeParse({ marginPct: -100 }).success).toBe(false);
    expect(ProductOverrideSchema.safeParse({ marginPct: -51 }).success).toBe(false);
    expect(ProductOverrideSchema.safeParse({ marginPct: -50 }).success).toBe(true);
  });

  it("RECHAZA campos desconocidos (.strict) — un typo no debe guardarse en silencio", () => {
    expect(
      ProductOverrideSchema.safeParse({ customFromPriceCent: 100 }).success,
    ).toBe(false);
  });
});

/**
 * Guard de CABLEADO, no de nombre: comprueba que la ruta admin que guarda el
 * override valida con ESTE esquema. Testear el esquema suelto no prueba que
 * esté enchufado — es el fallo que más veces ha mordido en este repo.
 *
 * Trabaja sobre el texto COLAPSADO (una llamada partida en varias líneas ya se
 * ha escapado tres veces de un guard) y falla si el fichero no existe, para no
 * quedarse en verde para siempre cuando la ruta se mueva de sitio.
 */
describe("guard: la ruta admin valida con este esquema", () => {
  const RUTA = "src/app/api/admin/products/[id]/route.ts";

  it("el route importa y usa ProductOverrideSchema, y no define uno propio", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    expect(fs.existsSync(RUTA)).toBe(true);

    const colapsado = fs.readFileSync(RUTA, "utf8").replace(/\s+/g, " ");

    expect(colapsado).toContain('from "@/lib/product-override-schema"');
    expect(colapsado).toMatch(/ProductOverrideSchema\s*\.\s*safeParse/);
    // Un esquema local volvería a dejar la validación sin test.
    expect(colapsado).not.toMatch(/const\s+\w*Override\w*Schema\s*=\s*z\s*\./);
  });
});
