import { describe, it, expect } from "vitest";
import {
  CartItemSchema,
  CartMarkingSchema,
  cartItemToCreate,
  MAX_REF,
  MAX_SLUG,
  MAX_URL,
  MAX_SKU,
  MAX_COLOR,
  MAX_POSITION_ID,
  MAX_TECHNIQUE_CODE,
  MAX_TECHNIQUE_NAME,
  type CanonicalCartItemInput,
} from "./cart-item-schema";

/**
 * Núcleo de carrito → persistencia. `cartItemToCreate` traduce una línea de
 * carrito (tal como llega del navegador) al objeto de create anidado de Prisma
 * que se guarda en /api/cart-quote y save-for-later. Es lógica de DINERO: si
 * pierde un marcaje o su `printAreaCm2`, el recálculo server-side elige el tramo
 * más barato y el cliente PAGA DE MENOS la impresión (regresión del P0 de la
 * auditoría). Estos tests fijan que el marcaje viaja íntegro y en orden.
 */

const base: CanonicalCartItemInput = {
  productSlug: "taza-ceramica",
  productRef: "STM-1001",
  productName: "Taza cerámica",
  quantity: 100,
};

describe("cartItemToCreate — marcaje (array multi-marca)", () => {
  it("no persiste HTML arbitrario enviado como productName por el navegador", () => {
    const out = cartItemToCreate({
      ...base,
      productName: "&lt;p&gt;Taza &amp; termo&lt;/p&gt;<script>alert(1)</script>",
    });
    expect(out.productName).toBe("Taza & termo");
  });

  it("persiste el array completo con order incremental y refleja el 1º en los campos planos", () => {
    const out = cartItemToCreate({
      ...base,
      markings: [
        {
          positionId: "front",
          positionLabel: "Frontal",
          techniqueCode: "SERIGRAFIA",
          techniqueName: "Serigrafía",
          numberOfColors: 3,
          manipulationCode: "P5",
          printAreaCm2: 50,
          notes: "logo",
        },
        {
          positionId: "back",
          positionLabel: "Trasera",
          techniqueCode: "DTF",
          techniqueName: "DTF",
          numberOfColors: 1,
          manipulationCode: null,
          printAreaCm2: 20,
          notes: null,
        },
      ],
    });

    // Campos planos = PRIMER marcaje (compat con la ficha antigua)
    expect(out.markingTechniqueCode).toBe("SERIGRAFIA");
    expect(out.markingTechniqueName).toBe("Serigrafía");
    expect(out.markingPositionId).toBe("front");
    expect(out.markingColours).toBe(3);
    expect(out.markingComplexity).toBe("P5");

    // Relación anidada: ambos marcajes, en orden 0,1
    expect(out.markings).toBeDefined();
    const created = out.markings!.create;
    expect(created).toHaveLength(2);
    expect(created[0].order).toBe(0);
    expect(created[1].order).toBe(1);
    expect(created[0].positionId).toBe("front");
    expect(created[1].positionId).toBe("back");
  });

  it("preserva printAreaCm2 en el create anidado (sin él se cobraría de menos)", () => {
    const out = cartItemToCreate({
      ...base,
      markings: [
        {
          positionId: "front",
          techniqueCode: "SERIGRAFIA",
          numberOfColors: 2,
          printAreaCm2: 87.5,
        },
      ],
    });
    expect(out.markings!.create[0].printAreaCm2).toBe(87.5);
  });

  it("printAreaCm2 ausente → null (no undefined perdido)", () => {
    const out = cartItemToCreate({
      ...base,
      markings: [
        { positionId: "front", techniqueCode: "SERIGRAFIA", numberOfColors: 1 },
      ],
    });
    expect(out.markings!.create[0].printAreaCm2).toBeNull();
  });
});

describe("cartItemToCreate — shape plano (deprecated) y precedencia", () => {
  it("construye 1 marcaje anidado desde los campos planos", () => {
    const out = cartItemToCreate({
      ...base,
      markingPositionId: "front",
      markingTechniqueCode: "SERIGRAFIA",
      markingTechniqueName: "Serigrafía",
      markingColours: 4,
      markingComplexity: "P3",
    });
    expect(out.markings!.create).toHaveLength(1);
    const m = out.markings!.create[0];
    expect(m.positionId).toBe("front");
    expect(m.techniqueCode).toBe("SERIGRAFIA");
    expect(m.numberOfColors).toBe(4);
    expect(m.manipulationCode).toBe("P3");
    expect(m.order).toBe(0);
  });

  it("numberOfColors cae a 1 cuando markingColours es null/ausente", () => {
    const out = cartItemToCreate({
      ...base,
      markingPositionId: "front",
      markingTechniqueCode: "DTF",
    });
    expect(out.markings!.create[0].numberOfColors).toBe(1);
  });

  it("el array multi-marca GANA al shape plano cuando vienen ambos", () => {
    const out = cartItemToCreate({
      ...base,
      markingPositionId: "back",
      markingTechniqueCode: "DTF",
      markingColours: 9,
      markings: [
        { positionId: "front", techniqueCode: "SERIGRAFIA", numberOfColors: 2 },
      ],
    });
    expect(out.markings!.create).toHaveLength(1);
    expect(out.markings!.create[0].positionId).toBe("front");
    expect(out.markingPositionId).toBe("front");
    expect(out.markingColours).toBe(2);
  });

  it("un array de markings vacío NO cuenta como marcaje (cae a plano o a nada)", () => {
    const conPlano = cartItemToCreate({
      ...base,
      markings: [],
      markingPositionId: "front",
      markingTechniqueCode: "DTF",
    });
    expect(conPlano.markings!.create).toHaveLength(1);
    expect(conPlano.markings!.create[0].positionId).toBe("front");
  });
});

describe("cartItemToCreate — sin marcaje", () => {
  it("markings es undefined (no un create vacío) y los campos planos son null", () => {
    const out = cartItemToCreate({ ...base });
    expect(out.markings).toBeUndefined();
    expect(out.markingTechniqueCode).toBeNull();
    expect(out.markingPositionId).toBeNull();
    expect(out.markingColours).toBeNull();
  });

  it("markingComplexity plano se conserva aunque no haya marcaje anidado", () => {
    const out = cartItemToCreate({ ...base, markingComplexity: "P2" });
    // Sin positionId+techniqueCode no se crea marcaje, pero el fallback plano vive
    expect(out.markings).toBeUndefined();
    expect(out.markingComplexity).toBe("P2");
  });
});

describe("cartItemToCreate — pass-through de precio, cantidad e identidad", () => {
  it("propaga precios y cantidad tal cual; nullish → null", () => {
    const out = cartItemToCreate({
      ...base,
      quantity: 250,
      unitPriceClientCents: 312,
      totalClientCents: 78000,
    });
    expect(out.quantity).toBe(250);
    expect(out.unitPriceClientCents).toBe(312);
    expect(out.totalClientCents).toBe(78000);

    const sinPrecio = cartItemToCreate({ ...base });
    expect(sinPrecio.unitPriceClientCents).toBeNull();
    expect(sinPrecio.totalClientCents).toBeNull();
  });

  it("propaga identidad de producto y los datos del logo del cliente", () => {
    const out = cartItemToCreate({
      ...base,
      variantSku: "TAZA-BF-U",
      colorName: "Blanco",
      primaryImageUrl: "/api/m/abc123",
      customerLogoUrl: "/api/m/logo456",
      customerLogoFilename: "logo.png",
      customerLogoSize: 20480,
      notes: "urgente",
    });
    expect(out.productRef).toBe("STM-1001");
    expect(out.variantSku).toBe("TAZA-BF-U");
    expect(out.colorName).toBe("Blanco");
    expect(out.primaryImageUrl).toBe("/api/m/abc123");
    expect(out.customerLogoUrl).toBe("/api/m/logo456");
    expect(out.customerLogoFilename).toBe("logo.png");
    expect(out.customerLogoSize).toBe(20480);
    expect(out.notes).toBe("urgente");
  });

  it("campos opcionales ausentes → null (nunca undefined en la fila persistida)", () => {
    const out = cartItemToCreate({ ...base });
    expect(out.variantSku).toBeNull();
    expect(out.colorName).toBeNull();
    expect(out.primaryImageUrl).toBeNull();
    expect(out.customerLogoUrl).toBeNull();
    expect(out.notes).toBeNull();
  });
});

describe("CartItemSchema / CartMarkingSchema — validación de límites", () => {
  it("acepta una línea mínima válida", () => {
    expect(CartItemSchema.safeParse(base).success).toBe(true);
  });

  it("acepta variantId público o SKU legacy, pero nunca ambos", () => {
    expect(CartItemSchema.safeParse({ ...base, variantId: "opaque-id" }).success).toBe(true);
    expect(CartItemSchema.safeParse({ ...base, variantSku: "LEGACY-SKU" }).success).toBe(true);
    expect(
      CartItemSchema.safeParse({
        ...base,
        variantId: "opaque-id",
        variantSku: "LEGACY-SKU",
      }).success,
    ).toBe(false);
  });

  it("rechaza cantidad no positiva o no entera", () => {
    expect(CartItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(CartItemSchema.safeParse({ ...base, quantity: -5 }).success).toBe(false);
    expect(CartItemSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
  });

  it("un marcaje exige positionId y techniqueCode", () => {
    expect(
      CartMarkingSchema.safeParse({ techniqueCode: "DTF" }).success,
    ).toBe(false);
    expect(
      CartMarkingSchema.safeParse({ positionId: "front" }).success,
    ).toBe(false);
    expect(
      CartMarkingSchema.safeParse({ positionId: "front", techniqueCode: "DTF" })
        .success,
    ).toBe(true);
  });

  it("printAreaCm2 debe ser positivo si viene", () => {
    expect(
      CartMarkingSchema.safeParse({
        positionId: "front",
        techniqueCode: "DTF",
        printAreaCm2: 0,
      }).success,
    ).toBe(false);
    expect(
      CartMarkingSchema.safeParse({
        positionId: "front",
        techniqueCode: "DTF",
        printAreaCm2: -3,
      }).success,
    ).toBe(false);
  });

  it("numberOfColors por defecto = 1 al parsear sin especificar", () => {
    const parsed = CartMarkingSchema.parse({
      positionId: "front",
      techniqueCode: "DTF",
    });
    expect(parsed.numberOfColors).toBe(1);
  });

  it("rechaza más de 10 marcajes por línea", () => {
    const many = Array.from({ length: 11 }, () => ({
      positionId: "p",
      techniqueCode: "DTF",
    }));
    expect(CartItemSchema.safeParse({ ...base, markings: many }).success).toBe(
      false,
    );
  });
});

/**
 * Topes de longitud de los campos que controla el navegador. Las dos rutas que
 * usan este schema son PÚBLICAS (sin sesión ni secreto, sólo rate limit) y lo
 * que aceptan se persiste tal cual en `CartQuoteItem`/`CartQuoteItemMarking`.
 *
 * ⚠️ Los tamaños de estos casos son LITERALES a propósito, no `MAX_X + 1`: un
 * caso que deriva su tamaño de la constante que vigila se mueve con ella, y
 * subir el tope a 100 MB dejaría la suite igual de verde (falso verde real,
 * cazado en el run del 19-ago en el schema de voz).
 */
describe("CartItemSchema — topes de longitud (rutas públicas)", () => {
  const ok = {
    productSlug: "taza-ceramica",
    productRef: "STM-1001",
    productName: "Taza cerámica",
    quantity: 100,
  };

  it("fija los topes en su valor medido, pase lo que pase con las constantes", () => {
    expect(MAX_REF).toBe(60);
    expect(MAX_SLUG).toBe(160);
    expect(MAX_URL).toBe(500);
    expect(MAX_SKU).toBe(60);
    expect(MAX_COLOR).toBe(120);
    expect(MAX_POSITION_ID).toBe(60);
    expect(MAX_TECHNIQUE_CODE).toBe(40);
    expect(MAX_TECHNIQUE_NAME).toBe(120);
  });

  it("acepta los valores más largos que existen hoy en producción", () => {
    // Máximos reales medidos el 19-ago-2026: ref 12, url 23, sku 20, color 25,
    // slug 80, y en marcaje 6 / 4 / 12.
    const r = CartItemSchema.safeParse({
      ...ok,
      productSlug: "s".repeat(80),
      productRef: "R".repeat(12),
      primaryImageUrl: "/api/m/" + "a".repeat(32),
      variantSku: "K".repeat(20),
      colorName: "C".repeat(25),
      markingPositionId: "front1",
      markingTechniqueCode: "SERI",
      markingTechniqueName: "Serigrafía",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un productRef absurdo aunque el resto sea válido", () => {
    const r = CartItemSchema.safeParse({ ...ok, productRef: "R".repeat(5000) });
    expect(r.success).toBe(false);
  });

  it("rechaza una primaryImageUrl de 100 KB", () => {
    const r = CartItemSchema.safeParse({ ...ok, primaryImageUrl: "x".repeat(100_000) });
    expect(r.success).toBe(false);
  });

  it("el shape plano legado NO puede saltarse los topes de markings[]", () => {
    // El agujero real: `cartItemToCreate` usa estos tres como fallback y los
    // persiste igual, pero sólo la vía nueva tenía `.max()`.
    for (const campo of ["markingPositionId", "markingTechniqueCode", "markingTechniqueName"]) {
      const r = CartItemSchema.safeParse({ ...ok, [campo]: "z".repeat(10_000) });
      expect(r.success, `${campo} sin tope`).toBe(false);
    }
  });

  it("los topes del shape plano son los MISMOS que los de markings[]", () => {
    const viaNueva = CartMarkingSchema.safeParse({
      positionId: "p".repeat(61),
      techniqueCode: "SERI",
    });
    const viaPlana = CartItemSchema.safeParse({ ...ok, markingPositionId: "p".repeat(61) });
    expect(viaNueva.success).toBe(false);
    expect(viaPlana.success).toBe(false);
  });

  it("rechaza un colorName y un variantSku desbordados", () => {
    expect(CartItemSchema.safeParse({ ...ok, colorName: "c".repeat(5000) }).success).toBe(false);
    expect(CartItemSchema.safeParse({ ...ok, variantSku: "k".repeat(5000) }).success).toBe(false);
  });
});
