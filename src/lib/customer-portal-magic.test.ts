import { describe, it, expect, vi, beforeEach } from "vitest";

const findOrCreateCustomerByEmail = vi.fn();
const customerUserUpdate = vi.fn();

vi.mock("@/lib/customer-auth", () => ({
  findOrCreateCustomerByEmail: (...a: unknown[]) => findOrCreateCustomerByEmail(...a),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerUser: {
      update: (...a: unknown[]) => customerUserUpdate(...a),
    },
  },
}));

import { createPostPaymentMagicLink } from "./customer-portal-magic";

/**
 * Tests de src/lib/customer-portal-magic.ts — el magic link al portal que
 * viaja dentro del email de post-pago. Estaba a 0 tests.
 *
 * Lo que se fija aquí es que ese enlace da acceso a los pedidos, facturas y
 * presupuestos del cliente: si se emitiera para un email que no es suyo, o
 * con un token adivinable, sería acceso a datos ajenos.
 */

beforeEach(() => {
  findOrCreateCustomerByEmail.mockReset();
  customerUserUpdate.mockReset();
  customerUserUpdate.mockResolvedValue({});
});

describe("createPostPaymentMagicLink", () => {
  it("🔒 no emite enlace si el email no corresponde a ningún cliente", async () => {
    // findOrCreateCustomerByEmail solo crea usuario si ese email tiene un
    // carrito. Sin usuario NO puede salir un enlace, ni tocarse la BD.
    findOrCreateCustomerByEmail.mockResolvedValue(null);

    expect(await createPostPaymentMagicLink("desconocido@ejemplo.com")).toBeNull();
    expect(customerUserUpdate).not.toHaveBeenCalled();
  });

  it("devuelve una URL absoluta a la ruta de consumo, con el token dentro", async () => {
    findOrCreateCustomerByEmail.mockResolvedValue({ id: "cus_1" });

    const url = await createPostPaymentMagicLink("cliente@ejemplo.com", "Cliente");

    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.pathname.startsWith("/api/clientes/auth/consume/")).toBe(true);

    const token = parsed.pathname.split("/").pop() as string;
    expect(token.startsWith("cmlt_")).toBe(true);
    // El token va en el path: no debe arrastrar query con datos del cliente.
    expect(parsed.search).toBe("");
    expect(url).not.toContain("cliente@ejemplo.com");
  });

  it("🔒 el token es aleatorio y largo — no se adivina ni se repite", async () => {
    findOrCreateCustomerByEmail.mockResolvedValue({ id: "cus_1" });

    const urls = await Promise.all([
      createPostPaymentMagicLink("a@ejemplo.com"),
      createPostPaymentMagicLink("a@ejemplo.com"),
      createPostPaymentMagicLink("a@ejemplo.com"),
    ]);
    const tokens = urls.map((u) => (u as string).split("/").pop() as string);

    expect(new Set(tokens).size).toBe(3);
    for (const t of tokens) {
      // 20 bytes en base64url ≈ 27 chars + el prefijo "cmlt_".
      expect(t.length).toBeGreaterThanOrEqual(30);
      expect(t).toMatch(/^cmlt_[A-Za-z0-9_-]+$/);
    }
  });

  it("guarda en el usuario CORRECTO el mismo token que viaja en la URL", async () => {
    findOrCreateCustomerByEmail.mockResolvedValue({ id: "cus_42" });

    const url = await createPostPaymentMagicLink("cliente@ejemplo.com");
    const token = (url as string).split("/").pop();

    expect(customerUserUpdate).toHaveBeenCalledTimes(1);
    const arg = customerUserUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { magicLinkToken: string; magicLinkExpiresAt: Date };
    };
    expect(arg.where).toEqual({ id: "cus_42" });
    expect(arg.data.magicLinkToken).toBe(token);
  });

  it("🔒 el enlace CADUCA — 7 días, ni permanente ni ya vencido", async () => {
    findOrCreateCustomerByEmail.mockResolvedValue({ id: "cus_1" });
    const antes = Date.now();

    await createPostPaymentMagicLink("cliente@ejemplo.com");

    const arg = customerUserUpdate.mock.calls[0][0] as {
      data: { magicLinkExpiresAt: Date };
    };
    const expira = arg.data.magicLinkExpiresAt.getTime();
    const sieteDias = 7 * 24 * 60 * 60 * 1000;

    expect(expira).toBeGreaterThan(antes);
    expect(expira - antes).toBeGreaterThanOrEqual(sieteDias - 5_000);
    expect(expira - antes).toBeLessThanOrEqual(sieteDias + 5_000);
  });

  it("traslada el nombre recibido a la búsqueda/creación del cliente", async () => {
    findOrCreateCustomerByEmail.mockResolvedValue({ id: "cus_1" });

    await createPostPaymentMagicLink("cliente@ejemplo.com", "Nombre Del Pago");

    expect(findOrCreateCustomerByEmail).toHaveBeenCalledWith(
      "cliente@ejemplo.com",
      "Nombre Del Pago",
    );
  });
});
