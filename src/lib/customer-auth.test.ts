import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

const customerUserFindUnique = vi.fn();
const cartQuoteFindFirst = vi.fn();
const customerUserCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerUser: {
      findUnique: (...a: unknown[]) => customerUserFindUnique(...a),
      create: (...a: unknown[]) => customerUserCreate(...a),
    },
    cartQuote: {
      findFirst: (...a: unknown[]) => cartQuoteFindFirst(...a),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

/**
 * Tests de src/lib/customer-auth.ts — el login del CLIENTE FINAL, que
 * estaba a 0 tests siendo uno de los cuatro guardianes de acceso del repo.
 *
 * ⚠️ El módulo resuelve el secreto de firma UNA VEZ, al importarse
 * (`const secret = (() => …)()`). Por eso el env se fija ANTES del import
 * dinámico y no en un `beforeAll`: un `beforeAll` aquí sería decorativo
 * —el mismo patrón que ya hizo que `dashboard-share.test.ts` corriera
 * durante meses contra el literal de desarrollo en vez de contra su env.
 *
 * Se firma con SOLO `ADMIN_SECRET` a propósito: es la configuración REAL de
 * producción (medido en el .env del VPS: `CUSTOMER_JWT_SECRET`,
 * `ADMIN_JWT_SECRET` y `AFFILIATE_JWT_SECRET` no existen), o sea el
 * escenario en el que los tres tipos de token comparten clave.
 */

const ADMIN_SECRET = "a".repeat(64);

async function loadModule() {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  delete process.env.CUSTOMER_JWT_SECRET;
  delete process.env.ADMIN_JWT_SECRET;
  vi.resetModules();
  return import("./customer-auth");
}

/** Firma un JWT con el MISMO secreto pero los claims que se le pidan. */
async function signWithClaims(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(ADMIN_SECRET));
}

beforeEach(() => {
  customerUserFindUnique.mockReset();
  cartQuoteFindFirst.mockReset();
  customerUserCreate.mockReset();
});

describe("verifyCustomerSession — camino legítimo", () => {
  it("acepta la sesión que firma la propia app y conserva los tres campos", async () => {
    const { signCustomerSession, verifyCustomerSession } = await loadModule();
    const token = await signCustomerSession({
      userId: "cus_1",
      email: "cliente@ejemplo.com",
      name: "Cliente Uno",
    });

    expect(await verifyCustomerSession(token)).toEqual({
      userId: "cus_1",
      email: "cliente@ejemplo.com",
      name: "Cliente Uno",
    });
  });

  it("acepta un cliente SIN nombre — CustomerUser.name es opcional", async () => {
    const { verifyCustomerSession } = await loadModule();
    const token = await signWithClaims({ userId: "cus_2", email: "b@ejemplo.com", name: "" });

    const session = await verifyCustomerSession(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("cus_2");
    expect(session?.name).toBe("");
  });
});

describe("verifyCustomerSession — rechazos (fail-closed)", () => {
  it("rechaza un token firmado con OTRO secreto", async () => {
    const { verifyCustomerSession } = await loadModule();
    const ajeno = await new SignJWT({ userId: "cus_1", email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("b".repeat(64)));

    expect(await verifyCustomerSession(ajeno)).toBeNull();
  });

  it("rechaza un token caducado", async () => {
    const { verifyCustomerSession } = await loadModule();
    const caducado = await new SignJWT({ userId: "cus_1", email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(ADMIN_SECRET));

    expect(await verifyCustomerSession(caducado)).toBeNull();
  });

  it("rechaza basura que no es un JWT", async () => {
    const { verifyCustomerSession } = await loadModule();
    expect(await verifyCustomerSession("no-soy-un-jwt")).toBeNull();
    expect(await verifyCustomerSession("")).toBeNull();
  });

  it("🔒 rechaza un token de AFILIADO copiado a la cookie de cliente", async () => {
    // El payload real de affiliate-magic es solo { partnerId }, y con la
    // config de producción se firma con el MISMO ADMIN_SECRET ⇒ supera el
    // jwtVerify. Sin el corte por claims esto devolvía {userId:"",email:""},
    // un objeto TRUTHY que pasa cualquier `if (!session) return 401`.
    const { verifyCustomerSession } = await loadModule();
    const tokenAfiliado = await signWithClaims({ partnerId: "partner_1" });

    expect(await verifyCustomerSession(tokenAfiliado)).toBeNull();
  });

  it("🔒 rechaza un token de ADMIN copiado a la cookie de cliente", async () => {
    const { verifyCustomerSession } = await loadModule();
    const tokenAdmin = await signWithClaims({ sub: "admin_1", role: "ADMIN" });

    expect(await verifyCustomerSession(tokenAdmin)).toBeNull();
  });

  it("🔒 rechaza un token bien firmado con userId pero SIN email", async () => {
    // El email es lo que usan de verdad /reorder y /invoice para comprobar
    // que el carrito o la factura son del cliente que pregunta.
    const { verifyCustomerSession } = await loadModule();
    expect(await verifyCustomerSession(await signWithClaims({ userId: "cus_1" }))).toBeNull();
  });

  it("🔒 rechaza un token bien firmado con email pero SIN userId", async () => {
    const { verifyCustomerSession } = await loadModule();
    expect(await verifyCustomerSession(await signWithClaims({ email: "a@b.com" }))).toBeNull();
  });

  it("🔒 rechaza claims presentes pero VACÍOS", async () => {
    const { verifyCustomerSession } = await loadModule();
    expect(await verifyCustomerSession(await signWithClaims({ userId: "", email: "" }))).toBeNull();
  });
});

describe("verifyCustomerSession — sin secreto configurado", () => {
  it("no valida NADA si no hay ningún secreto (no cae a un literal)", async () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CUSTOMER_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    vi.resetModules();
    const { verifyCustomerSession, signCustomerSession } = await import("./customer-auth");

    // Un token firmado con el secreto "de verdad" tampoco vale: sin secreto
    // el módulo rechaza todo en vez de aceptar con una clave por defecto.
    const token = await signWithClaims({ userId: "cus_1", email: "a@b.com" });
    expect(await verifyCustomerSession(token)).toBeNull();
    // Y firmar lanza, en vez de emitir una sesión que parece válida.
    await expect(
      signCustomerSession({ userId: "cus_1", email: "a@b.com", name: "x" }),
    ).rejects.toThrow();
  });
});

describe("authenticateCustomerRequest — lectura de la cookie", () => {
  it("extrae la sesión de la cookie merch_customer entre otras cookies", async () => {
    const { signCustomerSession, authenticateCustomerRequest } = await loadModule();
    const token = await signCustomerSession({
      userId: "cus_9",
      email: "nueve@ejemplo.com",
      name: "Nueve",
    });
    const req = new Request("https://x.test/", {
      headers: { cookie: `_ga=1; merch_customer=${token}; otra=2` },
    });

    expect((await authenticateCustomerRequest(req))?.userId).toBe("cus_9");
  });

  it("devuelve null sin cookie, y NO confunde la cookie de admin con la de cliente", async () => {
    const { signCustomerSession, authenticateCustomerRequest } = await loadModule();
    const token = await signCustomerSession({
      userId: "cus_9",
      email: "nueve@ejemplo.com",
      name: "Nueve",
    });

    expect(await authenticateCustomerRequest(new Request("https://x.test/"))).toBeNull();
    const soloAdmin = new Request("https://x.test/", {
      headers: { cookie: `merch_admin=${token}` },
    });
    expect(await authenticateCustomerRequest(soloAdmin)).toBeNull();
  });
});

describe("cookies de sesión", () => {
  it("la cookie de sesión es HttpOnly, SameSite=Lax y acotada a Path=/", async () => {
    const { customerCookieValue } = await loadModule();
    const cookie = customerCookieValue("tok");

    expect(cookie).toContain("merch_customer=tok");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800"); // 7 días
  });

  it("la cookie de cierre de sesión caduca de inmediato y no lleva token", async () => {
    const { clearCustomerCookieValue } = await loadModule();
    const cookie = clearCustomerCookieValue();

    expect(cookie).toContain("merch_customer=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});

describe("hashPassword / verifyPassword", () => {
  it("no guarda la contraseña en claro y solo valida la correcta", async () => {
    const { hashPassword, verifyPassword } = await loadModule();
    const hash = await hashPassword("secreta-123");

    expect(hash).not.toContain("secreta-123");
    expect(await verifyPassword("secreta-123", hash)).toBe(true);
    expect(await verifyPassword("secreta-124", hash)).toBe(false);
  }, 15_000);
});

describe("findOrCreateCustomerByEmail", () => {
  it("normaliza el email a minúsculas al buscar", async () => {
    const { findOrCreateCustomerByEmail } = await loadModule();
    customerUserFindUnique.mockResolvedValue({ id: "cus_1", email: "a@b.com" });

    const user = await findOrCreateCustomerByEmail("A@B.CoM");

    expect(user).toEqual({ id: "cus_1", email: "a@b.com" });
    expect(customerUserFindUnique).toHaveBeenCalledWith({ where: { email: "a@b.com" } });
    expect(customerUserCreate).not.toHaveBeenCalled();
  });

  it("🔒 NO crea usuario para un email que no tiene ningún carrito", async () => {
    // Es lo que impide que cualquiera se dé de alta en el portal de clientes
    // pidiendo un magic link a un email arbitrario.
    const { findOrCreateCustomerByEmail } = await loadModule();
    customerUserFindUnique.mockResolvedValue(null);
    cartQuoteFindFirst.mockResolvedValue(null);

    expect(await findOrCreateCustomerByEmail("desconocido@ejemplo.com")).toBeNull();
    expect(customerUserCreate).not.toHaveBeenCalled();
  });

  it("crea el usuario en minúsculas cuando sí hay carrito, heredando nombre y empresa", async () => {
    const { findOrCreateCustomerByEmail } = await loadModule();
    customerUserFindUnique.mockResolvedValue(null);
    cartQuoteFindFirst.mockResolvedValue({ name: "Del Carrito", company: "ACME" });
    customerUserCreate.mockResolvedValue({ id: "cus_2" });

    await findOrCreateCustomerByEmail("NUEVO@Ejemplo.com");

    expect(customerUserCreate).toHaveBeenCalledWith({
      data: { email: "nuevo@ejemplo.com", name: "Del Carrito", company: "ACME" },
    });
  });

  it("el nombre pasado por parámetro gana al del carrito", async () => {
    const { findOrCreateCustomerByEmail } = await loadModule();
    customerUserFindUnique.mockResolvedValue(null);
    cartQuoteFindFirst.mockResolvedValue({ name: "Del Carrito", company: null });
    customerUserCreate.mockResolvedValue({ id: "cus_3" });

    await findOrCreateCustomerByEmail("c@ejemplo.com", "Nombre Explícito");

    expect(customerUserCreate).toHaveBeenCalledWith({
      data: { email: "c@ejemplo.com", name: "Nombre Explícito", company: null },
    });
  });
});
