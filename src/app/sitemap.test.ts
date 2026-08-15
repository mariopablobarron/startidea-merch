import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  products: vi.fn(),
  categories: vi.fn(),
  posts: vi.fn(),
  magnets: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: (...args: unknown[]) => mocks.products(...args) },
    category: { findMany: (...args: unknown[]) => mocks.categories(...args) },
    blogPost: { findMany: (...args: unknown[]) => mocks.posts(...args) },
    leadMagnet: { findMany: (...args: unknown[]) => mocks.magnets(...args) },
  },
}));

import sitemap from "./sitemap";

beforeEach(() => {
  mocks.products.mockReset().mockResolvedValue(
    Array.from({ length: 3_001 }, (_, index) => ({
      slug: `producto-${String(index).padStart(4, "0")}`,
    })),
  );
  mocks.categories.mockReset().mockResolvedValue([]);
  mocks.posts.mockReset().mockResolvedValue([]);
  mocks.magnets.mockReset().mockResolvedValue([]);
});

describe("sitemap", () => {
  it("incluye el catálogo completo y consulta con orden estable", async () => {
    const result = await sitemap();
    expect(
      result.some((entry) => entry.url.endsWith("/catalogo/producto-3000")),
    ).toBe(true);
    expect(mocks.products).toHaveBeenCalledWith({
      where: { active: true, NOT: { override: { is: { hidden: true } } } },
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
  });

  it("deduplica URLs y solo publica lastmod respaldados por cambios reales", async () => {
    const older = new Date("2026-08-01T10:00:00.000Z");
    const newer = new Date("2026-08-03T12:00:00.000Z");
    mocks.categories.mockResolvedValue([
      { slug: "otros" },
      { slug: "mochilas" },
      { slug: "otros" },
      { slug: "otros" },
    ]);
    mocks.posts.mockResolvedValue([
      { slug: "post-antiguo", updatedAt: older, tags: ["Impacto social"] },
      {
        slug: "post-nuevo",
        updatedAt: newer,
        tags: ["Impacto social", "Eventos"],
      },
    ]);
    mocks.magnets.mockResolvedValue([{ slug: "guia-real" }]);

    const first = await sitemap();
    const second = await sitemap();
    const urls = first.map((entry) => entry.url);

    expect(new Set(urls).size).toBe(urls.length);
    expect(
      urls.filter((url) => url.endsWith("/categorias/otros")),
    ).toHaveLength(1);
    expect(second).toEqual(first);

    expect(
      first.find((entry) => entry.url.endsWith("/catalogo/producto-0000")),
    ).not.toHaveProperty("lastModified");
    expect(
      first.find((entry) => entry.url.endsWith("/categorias/otros")),
    ).not.toHaveProperty("lastModified");
    expect(
      first.find(
        (entry) => entry.url === "https://merchandising.startidea.es/",
      ),
    ).not.toHaveProperty("lastModified");
    expect(
      first.find((entry) => entry.url.endsWith("/blog/post-nuevo"))
        ?.lastModified,
    ).toEqual(newer);
    expect(
      first.find((entry) => entry.url.endsWith("/blog/tag/impacto-social"))
        ?.lastModified,
    ).toEqual(newer);
    expect(
      first.find((entry) => entry.url.endsWith("/recursos/guia-real")),
    ).not.toHaveProperty("lastModified");

    expect(mocks.posts).toHaveBeenCalledTimes(2);
    expect(mocks.posts).toHaveBeenLastCalledWith({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true, tags: true },
      orderBy: { slug: "asc" },
    });
    expect(mocks.categories).toHaveBeenLastCalledWith({
      select: { slug: true },
      orderBy: [{ slug: "asc" }, { id: "asc" }],
    });
    expect(mocks.magnets).toHaveBeenLastCalledWith({
      where: { active: true },
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
  });
});
