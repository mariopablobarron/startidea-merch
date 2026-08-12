import { describe, it, expect } from "vitest";
import {
  SupplierProfileSchema,
  SUPPLIER_CODES,
  SUPPLIER_DEFAULT_NAMES,
  MAX_DEFAULT_SHIPPING_CENTS,
} from "./supplier-profile-schema";

describe("SupplierProfileSchema · la casilla que GUARDA los portes por defecto", () => {
  it("acepta una ficha mínima", () => {
    expect(SupplierProfileSchema.safeParse({ code: "midocean" }).success).toBe(true);
  });

  it("acepta 0 € de portes: hay proveedores francos de portes", () => {
    const r = SupplierProfileSchema.safeParse({ code: "cifra", defaultShippingCents: 0 });
    expect(r.success).toBe(true);
  });

  it("acepta null para quitar el valor configurado", () => {
    const r = SupplierProfileSchema.safeParse({ code: "cifra", defaultShippingCents: null });
    expect(r.success).toBe(true);
  });

  it.each([
    ["negativo", -1],
    ["decimal", 812.5],
    ["por encima del techo de 10.000 €", MAX_DEFAULT_SHIPPING_CENTS + 1],
    ["NaN", Number.NaN],
  ])("rechaza portes %s — precargan un COSTE y salen en el PVP", (_caso, valor) => {
    const r = SupplierProfileSchema.safeParse({ code: "midocean", defaultShippingCents: valor });
    expect(r.success).toBe(false);
  });

  it("rechaza un proveedor que no existe", () => {
    expect(SupplierProfileSchema.safeParse({ code: "printful" }).success).toBe(false);
  });

  it("es estricto: un campo desconocido no se guarda en silencio", () => {
    const r = SupplierProfileSchema.safeParse({ code: "midocean", margenSecreto: 99 });
    expect(r.success).toBe(false);
  });

  it("acota el plazo de entrega a un año", () => {
    expect(SupplierProfileSchema.safeParse({ code: "makito", leadTimeDays: 366 }).success).toBe(false);
    expect(SupplierProfileSchema.safeParse({ code: "makito", leadTimeDays: 0 }).success).toBe(true);
  });

  it("hay un nombre por defecto para cada código (la landing no puede quedar en blanco)", () => {
    for (const code of SUPPLIER_CODES) {
      expect(SUPPLIER_DEFAULT_NAMES[code]).toBeTruthy();
    }
    expect(SUPPLIER_CODES).toHaveLength(4);
  });
});
