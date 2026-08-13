import { describe, it, expect } from "vitest";
import { findSupplierLeak, SUPPLIER_LEAK_TERMS, SUPPLIER_LEAK_HOSTS } from "./supplier-leak-terms";

describe("findSupplierLeak", () => {
  it("texto limpio de una propuesta real → null", () => {
    expect(findSupplierLeak("Sudadera orgánica negra con logo bordado a 1 color")).toBeNull();
    expect(findSupplierLeak("Pack 250 uds · botella térmica 500 ml grabada láser")).toBeNull();
    expect(findSupplierLeak("")).toBeNull();
  });

  it("caza CADA nombre de proveedor de la lista", () => {
    // Recorrer la lista y no escribir 6 casos a mano: si mañana se añade un
    // proveedor y findSupplierLeak deja de verlo, este test lo dice.
    for (const term of SUPPLIER_LEAK_TERMS) {
      expect(findSupplierLeak(`Producto de ${term} para el cliente`), `no cazó ${term}`).toBe(term);
    }
  });

  it("caza CADA host de CDN de proveedor", () => {
    for (const host of SUPPLIER_LEAK_HOSTS) {
      expect(findSupplierLeak(`Ver foto en https://${host}/img/1.jpg`), `no cazó ${host}`).toBe(host);
    }
  });

  it("es insensible a mayúsculas (así es como se teclea un nombre propio)", () => {
    expect(findSupplierLeak("Ref. MidOcean 1234")).toBe("midocean");
    expect(findSupplierLeak("MAKITO")).toBe("makito");
    expect(findSupplierLeak("Textil Cifra, talla L")).toBe("cifra");
  });

  it("lo caza pegado a puntuación, que es como aparece de verdad", () => {
    expect(findSupplierLeak("(midocean)")).toBe("midocean");
    expect(findSupplierLeak("proveedor: makito.")).toBe("makito");
    expect(findSupplierLeak("«Adivin»")).toBe("adivin");
    expect(findSupplierLeak("campo supplier_ref del feed")).toBe("supplier_ref");
    expect(findSupplierLeak("supplierRef=ABC")).toBe("supplierref");
  });

  it("NO marca palabras españolas que solo CONTIENEN un término", () => {
    // El motivo de buscar por palabra completa y no por subcadena: si el
    // saneador da ruido, alguien acaba desactivándolo.
    expect(findSupplierLeak("Texto descifrado y cifrado del pedido")).toBeNull();
    expect(findSupplierLeak("Adivinanza impresa en la taza")).toBeNull();
    expect(findSupplierLeak("Bolsa multiuso midoceanica")).toBeNull();
  });

  it("caza el host aunque el nombre suelto no bastara (fuga del 2026-07-20)", () => {
    // publicatalogue.com no contiene ningún nombre de proveedor: es el caso
    // exacto que se escapó del guard aquella vez.
    expect(findSupplierLeak("https://publicatalogue.com/p/9.jpg")).toBe("publicatalogue.com");
  });
});
