import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/portal/FavoriteHeart.tsx"),
  "utf8",
);
const responseSource = readFileSync(
  join(process.cwd(), "src/lib/customer-favorites-response.ts"),
  "utf8",
);

describe("guard: favorito distingue lectura anónima 200 de sesión activa", () => {
  it("usa authenticated y no depende de un 401 para detectar anonimato", () => {
    expect(source).toContain("favoriteIdsForSession(await r.json())");
    expect(responseSource).toContain("value.authenticated === false");
    expect(source).not.toContain("r.status === 401");
  });

  it("mantiene protegidas las mutaciones y redirige el click anónimo", () => {
    const anonymousGuard = source.indexOf("if (loggedIn === false)");
    const loginRedirect = source.indexOf('window.location.href = "/clientes/login"', anonymousGuard);
    const mutation = source.indexOf('const res = await fetch("/api/clientes/favorites"', anonymousGuard);

    expect(anonymousGuard).toBeGreaterThan(-1);
    expect(loginRedirect).toBeGreaterThan(anonymousGuard);
    expect(mutation).toBeGreaterThan(loginRedirect);
    expect(source).toContain('method: next ? "POST" : "DELETE"');
  });
});
