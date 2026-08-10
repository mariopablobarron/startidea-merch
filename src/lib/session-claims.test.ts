import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADMIN_ROLES,
  isAdminRole,
  hasAdminClaims,
  hasCustomerClaims,
} from "./session-claims";

/**
 * Tests de src/lib/session-claims.ts — el predicado compartido que decide
 * qué claims convierten un JWT verificado en una SESIÓN.
 *
 * Existe porque verificar la firma NO es autenticar: mientras los tres tipos
 * de token caigan al mismo ADMIN_SECRET, lo único que los distingue son sus
 * claims.
 */

const CLIENTE = { userId: "cus_1", email: "cliente@ejemplo.com", name: "Cliente" };
const ADMIN = { userId: "adm_1", email: "admin@startidea.es", name: "Admin", role: "CEO" };
const AFILIADO = { partnerId: "partner_1" };

describe("isAdminRole", () => {
  it.each(ADMIN_ROLES)("acepta el rol real %s", (rol) => {
    expect(isAdminRole(rol)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["cadena vacía", ""],
    ["rol inventado", "SUPERADMIN"],
    ["minúsculas", "ceo"],
    ["número", 1],
    ["objeto", {}],
    ["true", true],
  ])("rechaza %s", (_caso, valor) => {
    expect(isAdminRole(valor)).toBe(false);
  });

  it("🔒 la lista de roles NO se ha desincronizado del enum de Prisma", () => {
    // ADMIN_ROLES está duplicado a propósito (el middleware corre en edge y
    // no puede importar @prisma/client). Este test es lo que evita que ese
    // duplicado se quede atrás: si alguien añade un rol al schema y no aquí,
    // ese admin dejaría de poder entrar.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const bloque = schema.match(/enum AdminRole \{([^}]*)\}/);
    expect(bloque, "no se encontró el enum AdminRole en el schema").not.toBeNull();

    const delSchema = (bloque as RegExpMatchArray)[1]
      .split("\n")
      .map((l) => l.split("//")[0].trim())
      .filter(Boolean);

    expect(delSchema.length).toBeGreaterThanOrEqual(4);
    expect([...delSchema].sort()).toEqual([...ADMIN_ROLES].sort());
  });
});

describe("hasAdminClaims", () => {
  it("acepta una sesión de admin completa", () => {
    expect(hasAdminClaims(ADMIN)).toBe(true);
  });

  it("🔒 RECHAZA un token de CLIENTE — trae userId y email, pero no rol", () => {
    // El caso que importa: cualquiera obtiene un token de cliente por
    // magic-link a su propio email. Exigir userId+email NO habría bastado.
    expect(hasCustomerClaims(CLIENTE)).toBe(true);
    expect(hasAdminClaims(CLIENTE)).toBe(false);
  });

  it("🔒 RECHAZA un token de AFILIADO", () => {
    expect(hasAdminClaims(AFILIADO)).toBe(false);
  });

  it("🔒 rechaza un rol inventado por quien firma el token", () => {
    expect(hasAdminClaims({ ...ADMIN, role: "SUPERADMIN" })).toBe(false);
    expect(hasAdminClaims({ ...ADMIN, role: "" })).toBe(false);
  });

  it("rechaza si falta userId o email, aunque el rol sea válido", () => {
    expect(hasAdminClaims({ ...ADMIN, userId: "" })).toBe(false);
    expect(hasAdminClaims({ ...ADMIN, email: "" })).toBe(false);
    expect(hasAdminClaims({ role: "CEO" })).toBe(false);
  });

  it("rechaza claims que son solo espacios en blanco", () => {
    expect(hasAdminClaims({ ...ADMIN, email: "   " })).toBe(false);
  });

  it("rechaza claims que no son cadenas", () => {
    expect(hasAdminClaims({ ...ADMIN, userId: 123 })).toBe(false);
    expect(hasAdminClaims({})).toBe(false);
  });

  it("no exige `name` — es opcional también para un admin", () => {
    expect(hasAdminClaims({ userId: "a", email: "b@c.es", role: "OPERACIONES" })).toBe(true);
  });
});

describe("hasCustomerClaims", () => {
  it("acepta una sesión de cliente", () => {
    expect(hasCustomerClaims(CLIENTE)).toBe(true);
  });

  it("acepta un cliente SIN nombre (CustomerUser.name es opcional)", () => {
    expect(hasCustomerClaims({ userId: "cus_1", email: "a@b.com" })).toBe(true);
  });

  it("🔒 rechaza un token de afiliado y uno sin claims", () => {
    expect(hasCustomerClaims(AFILIADO)).toBe(false);
    expect(hasCustomerClaims({})).toBe(false);
  });

  it("un token de ADMIN sí es una sesión de cliente válida por forma", () => {
    // Deliberado y documentado: un admin trae userId+email, así que por
    // CLAIMS pasa. La dirección peligrosa es la contraria (cliente→admin),
    // que es la que se corta. Cerrar también esta dirección requiere separar
    // las claves por dominio (rama merch/jwt-domain-key), no más claims.
    expect(hasCustomerClaims(ADMIN)).toBe(true);
  });
});
