/**
 * Tests para GET /api/admin/suppliers/auditoria-precios.
 *
 * Lo que se vigila aquí no es el cálculo —eso vive en `auditarPrecios` y se
 * prueba con sus propios números— sino las dos cosas que hacen peligrosa a
 * ESTA ruta:
 *
 *  1. Devuelve COSTES NETOS de proveedor, y el esquema dice quién no debe
 *     verlos: «COMERCIAL … sin costes ni payments». No basta con estar
 *     autenticado, hace falta el rol.
 *  2. Un fallo dentro de la auditoría no puede contarle al navegador qué
 *     tablas tiene la base de datos.
 *
 * (Lo del BigInt de `COUNT(*)` se prueba en auditoria-precios.test.ts, que es
 * donde está la conversión.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
const auditarPrecios = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin-auth", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
}));
vi.mock("@/lib/auditoria-precios", () => ({
  auditarPrecios: (...a: unknown[]) => auditarPrecios(...a),
}));

import { GET } from "./route";

const PETICION = new Request("http://localhost/api/admin/suppliers/auditoria-precios");

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ ok: true, session: { email: "mario@startidea.es", role: "CEO" } });
  auditarPrecios.mockResolvedValue({ generadaEn: "2026-09-06T00:00:00.000Z", sinPrecio: { total: 0 } });
});

describe("GET /api/admin/suppliers/auditoria-precios", () => {
  it("sin sesión devuelve 401 y NO llega a consultar costes", async () => {
    requireRole.mockResolvedValue({ ok: false, status: 401, reason: "No autenticado" });
    const res = await GET(PETICION);
    expect(res.status).toBe(401);
    expect(auditarPrecios).not.toHaveBeenCalled();
  });

  it("un rol sin acceso a costes recibe 403 y tampoco los consulta", async () => {
    // El esquema es explícito: «COMERCIAL … sin costes ni payments». Esta
    // respuesta lleva costes netos de proveedor.
    requireRole.mockResolvedValue({ ok: false, status: 403, reason: "Requiere rol FACTURACION" });
    const res = await GET(PETICION);
    expect(res.status).toBe(403);
    expect(auditarPrecios).not.toHaveBeenCalled();
  });

  it("se pide el rol explícitamente, no vale cualquier sesión de admin", async () => {
    await GET(PETICION);
    expect(requireRole).toHaveBeenCalledWith(PETICION, "FACTURACION");
  });

  it("con el rol adecuado devuelve la auditoría", async () => {
    const res = await GET(PETICION);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.auditoria.generadaEn).toBe("2026-09-06T00:00:00.000Z");
  });

  it("si la auditoría falla, el error del servidor no se le enseña al navegador", async () => {
    // Los errores de Prisma citan nombres de tabla y de columna.
    auditarPrecios.mockRejectedValue(new Error('relation "PriceTier" does not exist'));
    const res = await GET(PETICION);
    expect(res.status).toBe(500);
    const cuerpo = await res.json();
    expect(JSON.stringify(cuerpo)).not.toContain("PriceTier");
  });
});
