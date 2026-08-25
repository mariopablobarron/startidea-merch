import { describe, expect, it } from "vitest";
import {
  catalogCanonical,
  hasFacets,
  pageNumber,
} from "./catalog-canonical";

const SITE = "https://merchandising.startidea.es";

describe("catalogCanonical", () => {
  it("la primera página se canonicaliza a sí misma, sin ?page=1", () => {
    // Un canonical con ?page=1 crearía una segunda URL para la misma página.
    expect(catalogCanonical({}, SITE)).toBe(`${SITE}/catalogo`);
    expect(catalogCanonical({ page: "1" }, SITE)).toBe(`${SITE}/catalogo`);
  });

  it("cada tramo de la serie es su propia URL canónica", () => {
    // Este es el cambio: antes las ~400 páginas devolvían /catalogo a secas.
    expect(catalogCanonical({ page: "2" }, SITE)).toBe(
      `${SITE}/catalogo?page=2`,
    );
    expect(catalogCanonical({ page: "37" }, SITE)).toBe(
      `${SITE}/catalogo?page=37`,
    );
  });

  it("la categoría sin paginar sigue consolidando en su landing limpia", () => {
    expect(catalogCanonical({ cat: "textil" }, SITE)).toBe(
      `${SITE}/categorias/textil`,
    );
    expect(catalogCanonical({ cat: "textil", page: "1" }, SITE)).toBe(
      `${SITE}/categorias/textil`,
    );
  });

  it("la categoría paginada NO apunta a la landing: la landing no pagina", () => {
    // Apuntar ahí escondería justo los productos que solo salen en ese tramo.
    expect(catalogCanonical({ cat: "textil", page: "3" }, SITE)).toBe(
      `${SITE}/catalogo?cat=textil&page=3`,
    );
  });

  it("una vista facetada consolida aunque venga paginada", () => {
    // Una faceta no es una serie: hacerla canónica sembraría el índice de
    // duplicados combinatorios (color × talla × material × orden × página).
    expect(catalogCanonical({ color: "rojo", page: "3" }, SITE)).toBe(
      `${SITE}/catalogo`,
    );
    expect(catalogCanonical({ q: "taza", page: "2" }, SITE)).toBe(
      `${SITE}/catalogo`,
    );
    expect(catalogCanonical({ sort: "stock", page: "5" }, SITE)).toBe(
      `${SITE}/catalogo`,
    );
    expect(catalogCanonical({ talla: "XL", page: "5" }, SITE)).toBe(
      `${SITE}/catalogo`,
    );
    expect(catalogCanonical({ mat: "algodon", page: "5" }, SITE)).toBe(
      `${SITE}/catalogo`,
    );
    // Y con categoría de por medio manda la faceta, no la serie.
    expect(catalogCanonical({ cat: "textil", color: "rojo", page: "3" }, SITE)).toBe(
      `${SITE}/categorias/textil`,
    );
  });

  it("una categoría con caracteres raros no rompe la URL", () => {
    expect(catalogCanonical({ cat: "bolsas & sacos", page: "2" }, SITE)).toBe(
      `${SITE}/catalogo?cat=bolsas+%26+sacos&page=2`,
    );
  });

  it("no duplica la barra si el site url viene con una al final", () => {
    expect(catalogCanonical({ page: "2" }, `${SITE}/`)).toBe(
      `${SITE}/catalogo?page=2`,
    );
  });
});

describe("pageNumber", () => {
  it("solo un entero mayor que 1 abre serie", () => {
    expect(pageNumber("2")).toBe(2);
    expect(pageNumber(" 3 ")).toBe(3);
    expect(pageNumber("1")).toBe(1);
    expect(pageNumber("0")).toBe(1);
    expect(pageNumber("-4")).toBe(1);
    expect(pageNumber("2.7")).toBe(1);
    expect(pageNumber("abc")).toBe(1);
    expect(pageNumber("")).toBe(1);
    expect(pageNumber(undefined)).toBe(1);
    // Basura numérica enorme: no debe convertirse en un canonical con Infinity
    // ni con notación exponencial.
    expect(pageNumber("99999999999999999999")).toBe(1);
    expect(pageNumber("2e3")).toBe(1);
  });
});

describe("hasFacets", () => {
  it("distingue faceta de serie", () => {
    expect(hasFacets({})).toBe(false);
    expect(hasFacets({ page: "4", cat: "textil" })).toBe(false);
    expect(hasFacets({ color: "rojo" })).toBe(true);
    // Un parámetro presente pero vacío no es un filtro activo.
    expect(hasFacets({ color: "", q: "  " })).toBe(false);
  });
});
