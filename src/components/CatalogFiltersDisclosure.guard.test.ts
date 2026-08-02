import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const disclosureSource = readFileSync(
  join(process.cwd(), "src/components/CatalogFiltersDisclosure.tsx"),
  "utf8",
);

const catalogSource = readFileSync(
  join(process.cwd(), "src/app/catalogo/page.tsx"),
  "utf8",
);

const cardActionsSource = readFileSync(
  join(process.cwd(), "src/components/CatalogCardActions.tsx"),
  "utf8",
);

describe("guard: filtros de catálogo compactos en móvil", () => {
  it("usa un disclosure nativo cerrado sin ocultar el panel de escritorio", () => {
    expect(disclosureSource).toContain('<details className="group lg:hidden">');
    expect(disclosureSource).toContain("<summary");
    expect(disclosureSource).toContain("group-open:block");
    expect(disclosureSource).toContain(
      '<aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">',
    );
    expect(disclosureSource).not.toContain("lg:contents");
  });

  it("limita el panel móvil y comunica los filtros activos", () => {
    expect(disclosureSource).toContain("max-h-[70vh]");
    expect(disclosureSource).toContain("overflow-y-auto");
    expect(disclosureSource).toContain("activeCount > 0");
    expect(catalogSource).toContain("activeCount={activeFilterCount}");
  });

  it("mantiene nombres accesibles en los campos sin etiqueta visible", () => {
    expect(catalogSource).toContain('aria-label="Buscar productos en el catálogo"');
    expect(catalogSource).toContain('aria-label="Precio mínimo por unidad"');
    expect(catalogSource).toContain('aria-label="Precio máximo por unidad"');
  });

  it("mantiene favorito y comparador fuera del enlace de producto", () => {
    expect(catalogSource).toMatch(
      /<article[\s\S]*?<Link[\s\S]*?<\/Link>\s*\{\/\* Acciones independientes:[\s\S]*?<FavoriteHeart[\s\S]*?<CompareBadge[\s\S]*?<\/article>/,
    );
    expect(cardActionsSource).not.toContain("absolute right-3 top-3 inline-flex");
  });
});
