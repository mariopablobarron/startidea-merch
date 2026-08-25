import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { mergeMetadata, withCanonicalOgUrl } from "./page-seo";

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

describe("withCanonicalOgUrl", () => {
  // Medido en producción el 25-ago-2026: 10 de 12 páginas anunciaban a las
  // redes que su URL era la home, heredada del layout raíz.
  it("deriva el og:url del canonical de la propia página", () => {
    const out = withCanonicalOgUrl({
      alternates: { canonical: "https://merchandising.startidea.es/sectores" },
      openGraph: { title: "Sectores" },
    });
    expect(out.openGraph?.url).toBe("https://merchandising.startidea.es/sectores");
    expect(out.openGraph?.title).toBe("Sectores");
  });

  it("no pisa un og:url que la página ya declara", () => {
    const out = withCanonicalOgUrl({
      alternates: { canonical: "https://merchandising.startidea.es/a" },
      openGraph: { url: "https://merchandising.startidea.es/b" },
    });
    expect(out.openGraph?.url).toBe("https://merchandising.startidea.es/b");
  });

  it("sin canonical no se inventa ninguna url", () => {
    const out = withCanonicalOgUrl({ openGraph: { title: "x" } });
    expect(out.openGraph?.url).toBeUndefined();
  });

  it("acepta el canonical en forma de objeto y de URL", () => {
    const objeto = withCanonicalOgUrl({
      alternates: { canonical: { url: "https://merchandising.startidea.es/c" } as never },
    });
    expect(objeto.openGraph?.url).toBe("https://merchandising.startidea.es/c");

    const url = withCanonicalOgUrl({
      alternates: { canonical: new URL("https://merchandising.startidea.es/d") },
    });
    expect(String(url.openGraph?.url)).toBe("https://merchandising.startidea.es/d");
  });

  it("mergeMetadata lo aplica también cuando no hay override en BD", () => {
    const base: Metadata = {
      alternates: { canonical: "https://merchandising.startidea.es/recursos" },
    };
    expect(mergeMetadata(base, null).openGraph?.url).toBe(
      "https://merchandising.startidea.es/recursos",
    );
    expect(base.openGraph).toBeUndefined(); // no muta el metadata de módulo
  });
});
