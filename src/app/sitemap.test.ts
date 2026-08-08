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
  const syncedAt = new Date("2026-08-08T00:00:00.000Z");
  mocks.products.mockReset().mockResolvedValue(
    Array.from({ length: 3_001 }, (_, index) => ({
      slug: `producto-${String(index).padStart(4, "0")}`,
      syncedAt,
    })),
  );
  mocks.categories.mockReset().mockResolvedValue([]);
  mocks.posts.mockReset().mockResolvedValue([]);
  mocks.magnets.mockReset().mockResolvedValue([]);
});

describe("sitemap", () => {
  it("incluye el catálogo completo y consulta con orden estable", async () => {
    const result = await sitemap();
    expect(result.some((entry) => entry.url.endsWith("/catalogo/producto-3000"))).toBe(true);
    expect(mocks.products).toHaveBeenCalledWith({
      where: { active: true, NOT: { override: { is: { hidden: true } } } },
      select: { slug: true, syncedAt: true },
      orderBy: { slug: "asc" },
    });
  });
});
