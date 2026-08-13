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
    // El motivo de buscar los wordlike por palabra completa y no por
    // subcadena: si el saneador da ruido, alguien acaba desactivándolo. Estas
    // dos frases son reales — tumbaron el CI el 13-ago desde /privacidad y
    // /llms.txt sin que hubiera fuga ninguna.
    expect(findSupplierLeak("Texto descifrado y cifrado del pedido")).toBeNull();
    expect(findSupplierLeak("cifras concretas de facturación")).toBeNull();
    expect(findSupplierLeak("Adivinanza impresa en la taza")).toBeNull();
  });

  it("caza el nombre pegado dentro de un IDENTIFICADOR (el fallo del 13-ago)", () => {
    // REGRESIÓN. Buscar TODOS los términos por palabra completa dejaba pasar
    // esto: el 13-ago se cerró la fuga de `fulfillment.midoceanOrderId` en la
    // API pública v1 y al día siguiente el detector ya no habría visto que
    // volvía. Un nombre de campo delata al proveedor igual que un valor, y en
    // un JSON o un HTML el nombre viene pegado a más letras, nunca suelto.
    expect(findSupplierLeak('{"fulfillment":{"midoceanOrderId":"ORD-9"}}')).toBe("midocean");
    expect(findSupplierLeak('{"midoceanOrderStatus":"sent"}')).toBe("midocean");
    expect(findSupplierLeak('{"makito_sku":"MK-1234"}')).toBe("makito");
    expect(findSupplierLeak('<div data-supplier="midocean-eu">')).toBe("midocean");
    expect(findSupplierLeak('<span class="badge-makito">')).toBe("makito");
  });

  it("los wordlike también se cazan en un identificador, sin recuperar el ruido", () => {
    // "cifra" no puede ir por subcadena (marcaría "cifrado"), pero un campo
    // `cifraOrderId` sí delata al proveedor. La mayúscula o el guion bajo que
    // vienen detrás no ocurren nunca en prosa española: son la señal de que
    // eso es un identificador y no la palabra corriente.
    expect(findSupplierLeak('{"cifraOrderId":"C-1"}')).toBe("cifra");
    expect(findSupplierLeak('{"cifra_ref":"C-1"}')).toBe("cifra");
    expect(findSupplierLeak('{"adivinOrderId":"A-1"}')).toBe("adivin");
    // Y la contraparte: la palabra normal sigue sin marcarse.
    expect(findSupplierLeak("El pedido va cifrado de extremo a extremo")).toBeNull();
  });

  it("caza el host aunque el nombre suelto no bastara (fuga del 2026-07-20)", () => {
    // publicatalogue.com no contiene ningún nombre de proveedor: es el caso
    // exacto que se escapó del guard aquella vez.
    expect(findSupplierLeak("https://publicatalogue.com/p/9.jpg")).toBe("publicatalogue.com");
  });
});
