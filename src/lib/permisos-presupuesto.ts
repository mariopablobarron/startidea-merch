/**
 * Quién puede convertir un lead en presupuesto.
 *
 * La verdad la impone el servidor: los endpoints que crean presupuestos
 * llaman a `requireRole(req, "COMERCIAL")`, y `requireRole` deja pasar
 * siempre a CEO. Este módulo es la MISMA regla del lado del cliente, y
 * existe solo para no pintar un botón que devolvería 403.
 *
 * No es un control de acceso: esconder un botón no protege nada. Si algún
 * día cambian los roles del endpoint, hay que cambiarlos aquí también —
 * el peor fallo posible es que diverjan y el panel enseñe una acción
 * imposible, que es exactamente lo que esto viene a arreglar.
 */
import type { AdminRole } from "@prisma/client";

/** Roles aceptados por `requireRole(req, "COMERCIAL")` — CEO incluido. */
export const ROLES_QUE_COTIZAN: readonly AdminRole[] = ["CEO", "COMERCIAL"];

export function puedeCotizar(role: string | null | undefined): boolean {
  return !!role && (ROLES_QUE_COTIZAN as readonly string[]).includes(role);
}
