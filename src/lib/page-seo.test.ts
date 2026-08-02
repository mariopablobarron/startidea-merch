import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { mergeMetadata } from "./page-seo";

describe("mergeMetadata", () => {
  it("no contamina el canonical entre una vista filtrada y /catalogo", () => {
    const base: Metadata = {
      title: "Catálogo",
      alternates: {
        canonical: "https://merchandising.startidea.es/catalogo",
      },
    };

    // Primera petición: /catalogo?cat=mochilas. Replica el ajuste dinámico
    // que hace generateMetadata después de aplicar los overrides de página.
    const filteredRequest = mergeMetadata(base, null);
    filteredRequest.alternates = {
      ...(filteredRequest.alternates || {}),
      canonical: "https://merchandising.startidea.es/categorias/mochilas",
    };

    // Segunda petición: /catalogo. Debe conservar su canonical limpio aunque
    // ambas generaciones partan del mismo BASE_METADATA a nivel de módulo.
    const catalogRequest = mergeMetadata(base, null);

    expect(filteredRequest.alternates?.canonical).toBe(
      "https://merchandising.startidea.es/categorias/mochilas",
    );
    expect(catalogRequest.alternates?.canonical).toBe(
      "https://merchandising.startidea.es/catalogo",
    );
    expect(base.alternates?.canonical).toBe(
      "https://merchandising.startidea.es/catalogo",
    );
    expect(catalogRequest).not.toBe(base);
  });
});
