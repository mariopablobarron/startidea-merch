import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectarFamiliasSinPack,
  esProductoCompleto,
  familiaDeUrl,
  type ItemGranFormato,
} from "./adivin-pack-gaps";

const url = (familia: string) => `https://adivin.com/es/${familia}/1-x.html`;
const item = (name: string, familia: string): ItemGranFormato => ({ name, sourceUrl: url(familia) });

describe("familiaDeUrl", () => {
  it("saca la familia de la URL del catálogo de origen", () => {
    expect(familiaDeUrl("https://adivin.com/es/photocall/449-estructura-photocall.html")).toBe("photocall");
    expect(familiaDeUrl("https://ejemplo.test/otra/cosa")).toBeNull();
  });
});

describe("esProductoCompleto — qué cuenta como «el producto entero»", () => {
  it("«Pack tensores elásticos» NO es el photocall entero", () => {
    // El fallo que este detector tiene que evitar: dar por cubierta la familia
    // porque hay un pack… de accesorios.
    expect(esProductoCompleto("Pack tensores elásticos", "photocall")).toBe(false);
  });

  it("un pack que nombra a su familia sí lo es", () => {
    expect(esProductoCompleto("Bandera y mástil para pared Pack", "banderas-para-pared")).toBe(true);
    expect(esProductoCompleto("Fly Banner Surf Pack completo", "fly-banner-surf")).toBe(true);
  });

  it("el artículo que se llama como la familia y no es una pieza lo es", () => {
    expect(esProductoCompleto("Cubo Publicitario", "cubo-publicitario")).toBe(true);
    expect(esProductoCompleto("Estructura Cubo Publicitario", "cubo-publicitario")).toBe(false);
    expect(esProductoCompleto("Tela Suelta Cubo Publicitario", "cubo-publicitario")).toBe(false);
  });
});

describe("detectarFamiliasSinPack", () => {
  it("señala el photocall: estructura y lona sueltas, ningún conjunto", () => {
    const huecos = detectarFamiliasSinPack([
      item("Pack tensores elásticos", "photocall"),
      item("Lona suelta para Photocall", "photocall"),
      item("Estructura Photocall", "photocall"),
    ]);
    expect(huecos).toHaveLength(1);
    expect(huecos[0].familia).toBe("photocall");
    expect(huecos[0].soportes).toEqual(["Estructura Photocall"]);
    expect(huecos[0].graficas).toEqual(["Lona suelta para Photocall"]);
  });

  it("no señala una familia que sí tiene su conjunto", () => {
    expect(
      detectarFamiliasSinPack([
        item("Bandera y mástil para pared Pack", "banderas-para-pared"),
        item("Mástil suelto para pared", "banderas-para-pared"),
        item("Bandera suelta para pared", "banderas-para-pared"),
      ]),
    ).toEqual([]);
  });

  it("no señala las categorías que son de accesorios a propósito", () => {
    // «Accesorios para carpas» no tiene pack porque no debe tenerlo: son
    // piezas de repuesto. Un detector que las marque acaba ignorándose.
    expect(
      detectarFamiliasSinPack([
        item("Base para carpa", "accesorios-para-carpas"),
        item("Fuelle para carpa", "accesorios-para-carpas"),
        item("Manivela para carpa", "accesorios-para-carpas"),
        item("Pata para carpa", "accesorios-para-carpas"),
      ]),
    ).toEqual([]);
  });

  it("hace falta soporte Y gráfica: una familia de solo bases no es un hueco", () => {
    expect(
      detectarFamiliasSinPack([
        item("Base Deluxe 4kg", "bases-para-fly-banners"),
        item("Base de agua", "bases-para-fly-banners"),
      ]),
    ).toEqual([]);
  });
});

describe("sobre el catálogo real que hay en el repositorio", () => {
  const seed: ItemGranFormato[] = JSON.parse(
    readFileSync(join(process.cwd(), "src/data/adivin-seed.json"), "utf8"),
  );

  it("detecta el hueco del photocall que se ve en la web", () => {
    const familias = detectarFamiliasSinPack(seed).map((h) => h.familia);
    expect(familias).toContain("photocall");
  });

  it("los huecos son estos tres y ninguno más (si cambia, mírale la cara)", () => {
    // Pin del estado actual de la captura. Que aparezca una familia nueva
    // significa que se capturó a medias; que desaparezca una, que ya se
    // capturó su pack — las dos cosas hay que verlas, no que pasen calladas.
    expect(detectarFamiliasSinPack(seed).map((h) => h.familia)).toEqual([
      "mochilas-fly-banner",
      "photocall",
      "x-banner",
    ]);
  });
});
