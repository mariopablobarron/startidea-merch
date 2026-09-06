import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sanitizeSupplierText,
  supplierJargonHits,
} from "./sanitize-supplier-text";

/**
 * GUARD de datos: el argumentario del catálogo MAYORISTA no llega a la ficha.
 *
 * Las 63 fichas de gran formato publicaban, palabra por palabra:
 *
 *   «… ✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online
 *     ✓ Fabricación y entrega en 24h【30% de margen】Envío gratis.»
 *
 * Eso es el catálogo del proveedor hablándole a su cliente —el distribuidor—,
 * publicado al cliente final: le dice que el producto no es para él y cuánto
 * gana Startidea revendiéndoselo.
 *
 * Este test mira el DATO, no el código: recorre el seed que alimenta el
 * importador y exige que, después de sanear, no quede nada de eso. Si el
 * proveedor estrena una frase nueva, esto se pone rojo en CI en vez de
 * limpiarse en silencio o publicarse.
 *
 * Desde el 1-sep-2026 cubre también los PLAZOS del proveedor —«Fabricación y
 * entrega en 24h»—, que no son jerga de canal sino una promesa de producción
 * suya publicada como si fuera un compromiso de Startidea con el cliente
 * final, y sus RECLAMOS comerciales —«Envío gratis», «100% Online»—, que son
 * las condiciones que el proveedor le da a su distribuidor. Decisión de Mario.
 */

type SeedItem = {
  supplierRef: string;
  name: string;
  material: string | null;
  descripcion: string | null;
  shortDescription: string | null;
};

/**
 * Campos del seed que acaban en la ficha pública.
 *
 * `descripcion` es la nuestra y `shortDescription` la del catálogo de origen.
 * Se vigilan las dos: la de origen porque no debe publicarse, y la nuestra
 * porque se escribe leyendo aquella y una frase se copia sin querer.
 */
const CAMPOS_PUBLICOS = ["name", "material", "descripcion", "shortDescription"] as const;

function seed(): SeedItem[] {
  return JSON.parse(readFileSync(join(process.cwd(), "src/data/adivin-seed.json"), "utf8"));
}

describe("guard · jerga de mayorista en el catálogo de gran formato", () => {
  it("el seed en crudo SÍ trae la jerga (si no, este guard no prueba nada)", () => {
    // Anti-falso-verde: el día que alguien limpie el seed a mano, este test
    // avisa de que el guard se ha quedado sin caso que vigilar.
    const conJerga = seed().filter((it) =>
      CAMPOS_PUBLICOS.some((c) => supplierJargonHits(it[c]).length > 0),
    );
    expect(conJerga.length).toBeGreaterThan(0);
  });

  it("después de sanear no queda jerga en NINGUNO de los 63 productos", () => {
    const sucios: string[] = [];
    for (const item of seed()) {
      for (const campo of CAMPOS_PUBLICOS) {
        const hits = supplierJargonHits(sanitizeSupplierText(item[campo]));
        if (hits.length) sucios.push(`${item.supplierRef} · ${campo}: ${hits.join(" | ")}`);
      }
    }
    expect(
      sucios,
      `Jerga de mayorista que sobrevive al saneador. Añade el patrón a ` +
        `MAYORISTA_RES en sanitize-supplier-text.ts:\n${sucios.join("\n")}`,
    ).toEqual([]);
  });

  it("sanear no deja la descripción vacía ni mutilada", () => {
    // Borrar la frase entera es correcto; dejar «✓ ✓ .» en la ficha, no.
    //
    // El listón NO es de longitud. Cuando el texto del proveedor era nueve
    // partes argumentario y una parte producto, lo que queda es corto de
    // verdad —«Pata para carpa»— y eso no es una mutilación: es lo que había.
    // Lo que se vigila es que empiece por texto, no por un resto de puntuación,
    // y que no queden marcas del borrado.
    for (const item of seed()) {
      const out = sanitizeSupplierText(item.shortDescription);
      if (item.shortDescription == null) continue;
      expect(out, `${item.supplierRef} quedó sin descripción`).toBeTruthy();
      expect(out!, `${item.supplierRef}: empieza por un resto → «${out}»`).toMatch(/^[\p{L}\p{N}]/u);
      expect(out!.length, `${item.supplierRef}: se quedó en nada → «${out}»`).toBeGreaterThan(3);
      expect(out, `${item.supplierRef}: restos de la frase borrada → «${out}»`).not.toMatch(
        /✓\s*✓|【|】|\s,|^\W+$|\u0000/,
      );
    }
  });

  it("todos los productos tienen descripción escrita por nosotros", () => {
    // Lo que sustituye al aviso que había aquí. Durante un tiempo este bloque
    // afirmaba lo contrario —que la mediana de la descripción no llegaba a 60
    // caracteres— para dejar constancia de que el filtrado había dejado el
    // catálogo en un renglón por ficha. Ya están escritas; ahora el guard
    // sirve para que no se pierdan ni vuelvan a ser un renglón.
    const sin = seed().filter((it) => !it.descripcion || it.descripcion.trim().length === 0);
    expect(sin.map((it) => `${it.supplierRef} · ${it.name}`)).toEqual([]);
  });

  it("y no son un renglón: ninguna baja de 80 caracteres", () => {
    const cortas = seed()
      .filter((it) => (it.descripcion ?? "").length < 80)
      .map((it) => `${it.supplierRef} · ${it.name} → ${(it.descripcion ?? "").length}`);
    expect(
      cortas,
      `Descripciones que se han quedado en un renglón:\n${cortas.join("\n")}`,
    ).toEqual([]);
  });

  it("la descripción propia no repite el argumentario de origen", () => {
    // Escribirlas mirando el texto del proveedor es lo natural; copiar una
    // frase suya, el accidente. Si la nuestra contiene la de origen entera,
    // no se ha escrito: se ha pegado.
    for (const it of seed()) {
      const origen = (it.shortDescription ?? "").split("✓")[0].trim();
      if (origen.length < 20) continue;
      expect(
        it.descripcion,
        `${it.supplierRef}: la descripción propia es la del catálogo de origen`,
      ).not.toBe(origen);
    }
  });
});

describe("guard · referencias del catálogo de gran formato", () => {
  // El import hace upsert por (supplier, supplierRef): dos filas con la misma
  // referencia son un solo producto y el resto se queda fuera de la tienda.
  //
  // Estas dos parejas comparten referencia en la captura y hay que resolverlas
  // en el origen, no aquí: la referencia es la que se usa para PEDIR la pieza
  // al proveedor, así que inventarle una haría llegar la equivocada.
  const COLISIONES_CONOCIDAS = new Set(["32", "550"]);

  it("no hay filas repetidas (misma referencia y mismo nombre)", () => {
    const vistas = new Set<string>();
    const repes: string[] = [];
    for (const it of seed()) {
      const k = `${it.supplierRef}\u0000${it.name}`;
      if (vistas.has(k)) repes.push(`${it.supplierRef} · ${it.name}`);
      vistas.add(k);
    }
    expect(repes).toEqual([]);
  });

  it("no aparecen colisiones de referencia nuevas", () => {
    const porRef = new Map<string, Set<string>>();
    for (const it of seed()) {
      if (!porRef.has(it.supplierRef)) porRef.set(it.supplierRef, new Set());
      porRef.get(it.supplierRef)!.add(it.name);
    }
    const nuevas = [...porRef.entries()]
      .filter(([ref, nombres]) => nombres.size > 1 && !COLISIONES_CONOCIDAS.has(ref))
      .map(([ref, nombres]) => `${ref} → ${[...nombres].join(" / ")}`);
    expect(
      nuevas,
      `Referencias compartidas por productos distintos. El segundo NO llega a ` +
        `la tienda; hay que capturar su referencia propia:\n${nuevas.join("\n")}`,
    ).toEqual([]);
  });

  it("y las conocidas siguen ahí (si se arreglan, hay que quitarlas de la lista)", () => {
    const porRef = new Map<string, Set<string>>();
    for (const it of seed()) {
      if (!porRef.has(it.supplierRef)) porRef.set(it.supplierRef, new Set());
      porRef.get(it.supplierRef)!.add(it.name);
    }
    for (const ref of COLISIONES_CONOCIDAS) {
      expect(
        porRef.get(ref)?.size ?? 0,
        `La colisión de la ref ${ref} ya no existe: bórrala de COLISIONES_CONOCIDAS`,
      ).toBeGreaterThan(1);
    }
  });
});

describe("los patrones que hay que cortar, uno a uno", () => {
  it.each([
    ["Exclusivamente para Rotulistas y Distribuidores", "Photocall ✓ Exclusivamente para Rotulistas y Distribuidores ✓ 100% Online"],
    ["Exclusivamente para Distribuidores", "Banderas ✓ Exclusivamente para Distribuidores ✓ Envío gratis."],
    ["【30% de margen】", "Carpa plegable【30% de margen】Envío gratis."],
    ["margen comercial del 30 %", "Producto con margen comercial del 30 % para el punto de venta."],
    ["PVP recomendado", "Photocall 3 m · PVP recomendado 262,86 €"],
    ["precio de distribuidor", "Consulta el precio de distribuidor en tu área."],
    ["tarifa de distribuidor", "Tarifa de distribuidor bajo registro."],
    ["venta al por mayor", "Ideal para venta al por mayor."],
    ["solo para profesionales del sector", "Producto solo para profesionales del sector."],
    // Plazos: la promesa de producción del proveedor, no la nuestra.
    ["Fabricación y entrega en 24h", "Photocall ✓ Fabricación y entrega en 24h ✓ Envío gratis."],
    ["entrega en 48 h", "Roll-up con entrega en 48 h."],
    ["plazo de entrega: 15 días", "Carpa plegable. Plazo de entrega: 15 días."],
    // Reclamos comerciales del proveedor.
    ["Envío gratis", "Banderas de 3 m ✓ Envío gratis."],
    ["100% Online", "Photocall ✓ 100% Online ✓ Montaje sin herramientas."],
  ])("corta «%s»", (_caso, texto) => {
    const out = sanitizeSupplierText(texto);
    expect(supplierJargonHits(out), `quedó: «${out}»`).toEqual([]);
  });

  it("NO se lleva por delante texto comercial legítimo", () => {
    // El saneador es agresivo con la jerga y conservador con lo demás: un
    // falso positivo aquí mutila la ficha de un producto que se vende.
    for (const texto of [
      "Vaso reutilizable de 400 ml para eventos y festivales.",
      "Bolsa de algodón 140 g/m² con asas largas.",
      "Photocall de 3 × 2,3 m con estuche de transporte.",
      "Distribuido en 8 colores y 3 tallas.",
      "Impresión a todo color por ambas caras.",
    ]) {
      expect(sanitizeSupplierText(texto)).toBe(texto);
    }
  });
});
