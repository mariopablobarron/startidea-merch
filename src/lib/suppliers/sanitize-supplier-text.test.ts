import { describe, it, expect } from "vitest";
import { sanitizeSupplierText, sanitizeSupplierName } from "./sanitize-supplier-text";

describe("sanitizeSupplierText — fugas reales", () => {
  it("convierte HTML y entidades heredadas de Cifra antes de sanear", () => {
    expect(sanitizeSupplierText("<p>Poliéster &amp; algodón</p>")).toBe(
      "Poliéster & algodón",
    );
    expect(sanitizeSupplierText("&lt;p&gt;Acero&amp;nbsp;inoxidable&lt;/p&gt;")).toBe(
      "Acero inoxidable",
    );
  });

  it("borra el email interno del proveedor de la nota que se sirvió en producción", () => {
    // Texto EXACTO que el 28-jul-2026 se servía en 5 fichas de Cifra, dentro de
    // la meta description y la og:description.
    const real =
      "Para opciones de personalizado consultar con el departamento de marcaje produccion@cifra.es";
    const out = sanitizeSupplierText(real);
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/cifra/i);
    expect(out).toBe("Para opciones de personalizado consultar con el departamento de marcaje");
  });

  it("borra cualquier email, sea del dominio que sea", () => {
    for (const t of [
      "Consultas a pedidos@makito.es gracias",
      "escribe a Ventas.Internacional@midocean.com",
      "info@adivin.net",
    ]) {
      // null cuando el campo entero era el email: no queda nada que mostrar.
      expect(sanitizeSupplierText(t) ?? "").not.toMatch(/@/);
    }
  });

  it("borra URLs y dominios del proveedor", () => {
    expect(sanitizeSupplierText("Ver catálogo en https://www.cifra.es/catalogo.pdf")).toBe(
      "Ver catálogo en",
    );
    expect(sanitizeSupplierText("Descarga en www.makito.es/tarifas")).toBe("Descarga en");
    // La puntuación que queda colgando al final del borrado también se limpia.
    expect(sanitizeSupplierText("Imagen: https://cdn1.midocean.com/x.jpg")).toBe("Imagen");
  });

  it("borra nombres de marca de proveedor inequívocos", () => {
    expect(sanitizeSupplierText("Bolígrafo MAKITO de aluminio")).toBe("Bolígrafo de aluminio");
    expect(sanitizeSupplierText("Producto MidOcean Brands")).toBe("Producto Brands");
    expect(sanitizeSupplierText("Mid-Ocean referencia interna")).toBe("referencia interna");
    expect(sanitizeSupplierText("Grupo Cifra, S.L.")).toBe("S.L.");
  });

  it("devuelve null si tras sanear no queda contenido", () => {
    expect(sanitizeSupplierText("makito")).toBeNull();
    expect(sanitizeSupplierText("info@midocean.com")).toBeNull();
    expect(sanitizeSupplierText("   ")).toBeNull();
    expect(sanitizeSupplierText("- , .")).toBeNull();
  });

  it("normaliza null/undefined/vacío", () => {
    expect(sanitizeSupplierText(null)).toBeNull();
    expect(sanitizeSupplierText(undefined)).toBeNull();
    expect(sanitizeSupplierText("")).toBeNull();
  });

  it("cierra la deuda de brand='midocean' en el próximo sync", () => {
    // 2.434 productos tenían el nombre literal del proveedor en Product.brand.
    // Al pasar por el saneador el campo queda a null en vez de crudo en BD.
    expect(sanitizeSupplierText("midocean")).toBeNull();
    expect(sanitizeSupplierText("MidOcean")).toBeNull();
  });
});

describe("sanitizeSupplierText — NO destruye texto legítimo (falsos positivos)", () => {
  it("respeta 'cifra' como sustantivo común en castellano", () => {
    const t = "Descuento sobre la cifra total del pedido";
    expect(sanitizeSupplierText(t)).toBe(t);
    expect(sanitizeSupplierText("Una cifra de seis dígitos")).toBe("Una cifra de seis dígitos");
  });

  it("respeta 'adivina'/'adivinar' (verbo), borra solo 'Adivin' exacto", () => {
    expect(sanitizeSupplierText("Adivina quién viene a cenar")).toBe("Adivina quién viene a cenar");
    expect(sanitizeSupplierText("Juego para adivinar palabras")).toBe("Juego para adivinar palabras");
    expect(sanitizeSupplierText("Referencia Adivin 900")).toBe("Referencia 900");
  });

  it("deja intacta una descripción de producto normal", () => {
    const t =
      "Camiseta de algodón 100% orgánico, 180 g/m². Disponible en tallas S-XXL y 12 colores.";
    expect(sanitizeSupplierText(t)).toBe(t);
  });

  it("colapsa espacios y corrige la puntuación que deja el borrado", () => {
    expect(sanitizeSupplierText("Marcaje  láser   disponible")).toBe("Marcaje láser disponible");
    expect(sanitizeSupplierText("Consultar (info@cifra.es) para más datos")).toBe(
      "Consultar para más datos",
    );
    expect(sanitizeSupplierText("Personalizable , consultar")).toBe("Personalizable, consultar");
  });
});

describe("sanitizeSupplierName — Product.name es NOT NULL", () => {
  it("sanea el nombre como el resto de campos", () => {
    expect(sanitizeSupplierName("BOLIGRAFO MAKITO YUYI")).toBe("BOLIGRAFO YUYI");
  });

  it("conserva el original si el saneado lo dejaría vacío (un producto sin nombre rompe la ficha)", () => {
    expect(sanitizeSupplierName("Makito")).toBe("Makito");
    expect(sanitizeSupplierName("  Makito  ")).toBe("Makito");
  });

  it("limpia la forma real del nombre heredado de Cifra", () => {
    expect(sanitizeSupplierName("<p>BALÓN DE REGLAMENTO</p>")).toBe(
      "BALÓN DE REGLAMENTO",
    );
    expect(sanitizeSupplierName("<p>BOLÍGRAFO SIN CIERRE")).toBe("BOLÍGRAFO SIN CIERRE");
  });

  it("nunca devuelve null ni undefined", () => {
    expect(sanitizeSupplierName(null)).toBe("Producto");
    expect(sanitizeSupplierName(undefined)).toBe("Producto");
  });
});
