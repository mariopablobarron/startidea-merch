import { describe, expect, it, vi } from "vitest";
import { resolveProductBySlug, resolveProductsBySlugs } from "./product-slug-resolver";

describe("resolveProductBySlug", () => {
  it("da prioridad al producto vivo exacto aunque exista un redirect conflictivo", async () => {
    const find = vi.fn(async (slug: string) => (slug === "exacto" ? { id: "live" } : null));
    const redirect = vi.fn(async () => "otro");
    const result = await resolveProductBySlug("exacto", find, redirect);
    expect(result).toMatchObject({ product: { id: "live" }, canonicalSlug: "exacto", redirected: false });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("resuelve oldSlug al producto canónico y rechaza tombstones", async () => {
    const find = vi.fn(async (slug: string) => (slug === "nuevo" ? { id: "p1" } : null));
    expect(await resolveProductBySlug("viejo", find, async () => "nuevo")).toMatchObject({
      product: { id: "p1" },
      requestedSlug: "viejo",
      canonicalSlug: "nuevo",
      redirected: true,
    });
    expect(await resolveProductBySlug("borrado", find, async () => null)).toBeNull();
  });
});

describe("resolveProductsBySlugs", () => {
  it("resuelve en lote, conserva la clave solicitada y no duplica consultas", async () => {
    const all = [
      { id: "live", slug: "exacto" },
      { id: "canonical", slug: "nuevo" },
    ];
    const find = vi.fn(async (slugs: ReadonlyArray<string>) =>
      all.filter((product) => slugs.includes(product.slug)),
    );
    const result = await resolveProductsBySlugs(
      ["viejo", "exacto", "viejo", "ausente"],
      find,
      async () => new Map([["viejo", "nuevo"]]),
    );
    expect(result.get("viejo")).toMatchObject({ canonicalSlug: "nuevo", redirected: true });
    expect(result.get("exacto")).toMatchObject({ canonicalSlug: "exacto", redirected: false });
    expect(result.has("ausente")).toBe(false);
    expect(find).toHaveBeenCalledTimes(2);
  });
});
