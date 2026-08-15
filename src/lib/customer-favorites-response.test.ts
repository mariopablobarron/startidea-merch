import { describe, expect, it } from "vitest";
import { favoriteIdsForSession } from "./customer-favorites-response";

describe("favoriteIdsForSession", () => {
  it("interpreta authenticated:false como sesión anónima aunque ids esté vacío", () => {
    expect(favoriteIdsForSession({ authenticated: false, ids: [] })).toBeNull();
  });

  it("acepta el contrato autenticado nuevo", () => {
    expect([
      ...favoriteIdsForSession({ authenticated: true, ids: ["prod_1", "prod_2"] })!,
    ]).toEqual(["prod_1", "prod_2"]);
  });

  it("acepta durante la transición el contrato autenticado legacy", () => {
    expect([...favoriteIdsForSession({ ids: ["prod_1"] })!]).toEqual(["prod_1"]);
  });

  it("falla cerrado ante payloads malformados", () => {
    expect(favoriteIdsForSession({})).toBeNull();
    expect(favoriteIdsForSession(null)).toBeNull();
    expect(favoriteIdsForSession({ authenticated: true, ids: "prod_1" })).toBeNull();
    expect(favoriteIdsForSession({ authenticated: "false", ids: [] })).toBeNull();
    expect(favoriteIdsForSession({ authenticated: true, ids: ["prod_1", 2] })).toBeNull();
  });
});
