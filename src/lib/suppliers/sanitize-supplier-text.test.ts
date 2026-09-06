import { describe, it, expect } from "vitest";
import {
  assertNoSupplierJargon,
  sanitizeSupplierName,
  sanitizeSupplierText,
  supplierJargonHits,
} from "./sanitize-supplier-text";

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

describe("plazos del proveedor — su promesa no es la nuestra", () => {
  it("borra «Fabricación y entrega en 24h» de la ficha de gran formato", () => {
    // La cadena literal de las 58 fichas de Ádivin, entera.
    const limpio = sanitizeSupplierText(
      "Bases para carpas ✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online " +
        "✓ Fabricación y entrega en 24h【30% de margen】Envío gratis. · Medidas: 1,5×1,5 m",
    );
    expect(limpio).not.toMatch(/24\s*h/i);
    expect(limpio).not.toMatch(/fabricaci[oó]n\s+y\s+entrega/i);
    // Y lo que sí es información del producto se queda.
    expect(limpio).toContain("Bases para carpas");
    expect(limpio).toContain("Medidas: 1,5×1,5 m");
  });

  it("cae cualquier plazo, no solo el de 24 h", () => {
    // El plazo de un pedido se fija en su presupuesto y siempre «desde la
    // validación del arte final»; en una ficha de catálogo no pinta nada.
    for (const texto of [
      "Entrega en 48 h",
      "Envío en 24/48 h",
      "Fabricación en 15 días laborables",
      "Plazo de entrega: 10 días",
      "Entrega 24h",
    ]) {
      expect(sanitizeSupplierText(`Mochila de algodón. ${texto}.`), texto).toBe(
        "Mochila de algodón.",
      );
    }
  });

  it("no se lleva por delante una medida ni un gramaje", () => {
    // El saneador es conservador: solo cae lo que es un plazo de verdad.
    expect(sanitizeSupplierText("Lona de 510 g/m² · altura máx. 3,40 m")).toBe(
      "Lona de 510 g/m² · altura máx. 3,40 m",
    );
    expect(sanitizeSupplierText("Bolsa con asas de 24 cm")).toBe("Bolsa con asas de 24 cm");
    expect(sanitizeSupplierText("Pack de 24 unidades")).toBe("Pack de 24 unidades");
    // Y los puntos suspensivos siguen siendo tres, no uno: el colapso de «..»
    // que limpia el hueco de una frase borrada no puede comerse un «...».
    expect(sanitizeSupplierText("Colores: rojo, azul, verde...")).toBe(
      "Colores: rojo, azul, verde...",
    );
  });

  it("el import se rompe si un plazo llega hasta el campo público", () => {
    // La regla del encargo: fallar, no limpiar en silencio.
    expect(supplierJargonHits("Fabricación y entrega en 24h")).toContain(
      "Fabricación y entrega en 24h",
    );
    expect(() => assertNoSupplierJargon("Entrega en 48 h", "shortDescription AD-155")).toThrow(
      /Entrega en 48 h/,
    );
  });

  it("supplierJargonHits no se queda ciego en la segunda llamada", () => {
    // Los patrones son globales: reutilizarlos con `.test()` o sin recrearlos
    // arrastra `lastIndex` y la segunda ficha del import pasaría limpia.
    const texto = "Fabricación y entrega en 24h";
    expect(supplierJargonHits(texto)).toHaveLength(1);
    expect(supplierJargonHits(texto)).toHaveLength(1);
    expect(supplierJargonHits(texto)).toHaveLength(1);
  });
});

describe("reclamos del proveedor — sus condiciones no son las nuestras", () => {
  it("la ficha de gran formato queda con el producto y las medidas, y nada más", () => {
    expect(
      sanitizeSupplierText(
        "Bases para carpas ✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online " +
          "✓ Fabricación y entrega en 24h【30% de margen】Envío gratis. " +
          "· Medidas: 1,5×1,5 · 3×3 m",
      ),
      // El punto que cerraba «Envío gratis.» se va con la frase borrada; el
      // «·» ya separa lo que queda.
    ).toBe("Bases para carpas · Medidas: 1,5×1,5 · 3×3 m");
  });

  it("corta el envío gratis en sus formas habituales", () => {
    for (const texto of [
      "Envío gratis",
      "Envíos gratuitos",
      "Portes gratuitos",
      "Transporte incluido",
    ]) {
      expect(sanitizeSupplierText(`Roll-up de 85 cm. ${texto}.`), texto).toBe("Roll-up de 85 cm.");
    }
  });

  it("no toca un envío que sí es información del producto", () => {
    // Conservador como el resto: solo cae la promesa, no la palabra.
    expect(sanitizeSupplierText("Se envía plegado en su estuche.")).toBe(
      "Se envía plegado en su estuche.",
    );
    expect(sanitizeSupplierText("Impresión a todo color al 100%.")).toBe(
      "Impresión a todo color al 100%.",
    );
  });

  it("el import se rompe si un reclamo llega hasta el campo público", () => {
    expect(supplierJargonHits("Envío gratis")).toContain("Envío gratis");
    expect(() => assertNoSupplierJargon("100% Online", "shortDescription AD-155")).toThrow(
      /100% Online/,
    );
  });
});

describe("lo que dejaba a medias el borrado", () => {
  it("un plazo con adjetivo delante cae entero, no a trozos", () => {
    // «Envío gratis en 24h» se partía entre dos grupos: uno se llevaba «Envío
    // gratis» y el otro ya no encajaba con lo que quedaba, así que la ficha
    // publicaba «en 24h» suelto y `supplierJargonHits` no lo veía.
    for (const texto of [
      "Envío gratis en 24h",
      "Envío gratuito en 48 h",
      "Portes gratuitos en 3 días",
      "Entrega urgente en 24 horas",
    ]) {
      const limpio = sanitizeSupplierText(`Roll-up de 85 cm. ${texto}.`);
      expect(limpio, texto).toBe("Roll-up de 85 cm.");
      expect(supplierJargonHits(limpio), texto).toEqual([]);
    }
  });

  it("dos frases borradas seguidas no dejan puntos suspensivos falsos", () => {
    // «A. X. Y. B.» con X e Y borradas quedaba en «A... B.»: tres puntos que
    // parecen suspensivos y no lo son.
    expect(
      sanitizeSupplierText("Roll-up. Exclusivamente para Distribuidores. Envío gratis. Fin."),
    ).toBe("Roll-up. Fin.");
  });

  it("y unos suspensivos de verdad siguen intactos", () => {
    expect(sanitizeSupplierText("Roll-up. A... B.")).toBe("Roll-up. A... B.");
  });
});
