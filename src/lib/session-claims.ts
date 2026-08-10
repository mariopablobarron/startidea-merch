/**
 * Qué claims convierten un JWT verificado en una SESIÓN.
 *
 * Verificar la firma NO es autenticar. Mientras no existan
 * `ADMIN_JWT_SECRET` / `CUSTOMER_JWT_SECRET` / `AFFILIATE_JWT_SECRET` como
 * variables propias (hoy en producción solo hay `ADMIN_SECRET`), los tres
 * tipos de token —admin, cliente y afiliado— se firman con la MISMA clave,
 * así que el `jwtVerify` de cualquiera de ellos pasa en todos los demás. Lo
 * único que los distingue son sus claims.
 *
 * Este módulo es puro y sin dependencias a propósito: lo importan tanto el
 * servidor (`admin-auth`, `customer-auth`) como el `middleware`, que corre en
 * el runtime EDGE. Tenerlo en un solo sitio es lo que impide que el gate del
 * borde y el del servidor se separen con el tiempo — que es como se cuelan
 * estos fallos.
 *
 * NOTA: la separación de claves por dominio (rama `merch/jwt-domain-key`)
 * sigue siendo el arreglo de fondo. Esto no la sustituye: cierra la
 * confusión de audiencia sin invalidar ninguna sesión viva.
 */

/** Los cuatro valores del enum `AdminRole` de Prisma. Duplicado a propósito:
 *  el middleware corre en edge y no puede arrastrar `@prisma/client`.
 *  `admin-auth.test.ts` comprueba que esta lista no se desincroniza. */
export const ADMIN_ROLES = ["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"] as const;

export type AdminRoleName = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: unknown): value is AdminRoleName {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

type Claims = Record<string, unknown>;

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Una sesión de ADMIN exige rol válido, y no solo estar presente.
 *
 * Es lo que separa a un admin de un cliente: un token de cliente legítimo
 * —que cualquiera obtiene por magic-link a su propio email— trae `userId` y
 * `email`, así que exigirlos NO basta. Sin `role` en el enum, el objeto
 * devuelto llevaba `role: undefined`, seguía siendo truthy, y `isAdmin()` y
 * los ~80 endpoints que solo comprueban que haya sesión lo daban por bueno.
 */
export function hasAdminClaims(payload: Claims): boolean {
  return nonEmptyString(payload.userId) && nonEmptyString(payload.email) && isAdminRole(payload.role);
}

/**
 * Una sesión de CLIENTE exige lo que identifica al cliente. `name` no:
 * `CustomerUser.name` es opcional y firmarlo vacío es legítimo.
 */
export function hasCustomerClaims(payload: Claims): boolean {
  return nonEmptyString(payload.userId) && nonEmptyString(payload.email);
}
