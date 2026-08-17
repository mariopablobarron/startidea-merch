/**
 * Regla del watchdog de overrides de precio desfasados — módulo PURO.
 *
 * Vive fuera de `api/cron/override-price-drift/route.ts` porque un route handler
 * solo puede exportar sus métodos HTTP: la regla no se podía probar sin montar
 * la ruta entera, y por eso el fallo de abajo aguantó seis semanas sin test.
 */

/**
 * Proveedores cuyo `Product.fromPriceCents` NO es coste neto sino PVP.
 *
 * Adivin no tiene API: se carga con `scripts/import-adivin.ts` desde un CSV que
 * trae `pvp_sin_iva`. Su `customFromPriceCents` existe justo para que el margen
 * global no se aplique ENCIMA de un precio que ya lo lleva (doble margen), no
 * porque alguien fijara un precio a mano. Su coste de compra no está en la BD.
 *
 * Añadir aquí cualquier proveedor nuevo de carga manual cuyo CSV traiga PVP.
 */
export const PRECIO_GUARDADO_ES_PVP: readonly string[] = ["adivin"];

/** Por debajo de este ratio PVP/coste, avisar. 1,3 ≈ 23% sobre venta. */
export const WARN_RATIO = 1.3;

export type DriftInput = {
  supplier: string;
  active: boolean;
  /** Precio cliente fijado a mano (customFromPriceCents). */
  clientCents: number;
  /** Product.fromPriceCents — se asume COSTE NETO. */
  netCents: number;
};

export type DriftVerdict =
  | { kind: "ignorado"; motivo: "inactivo" | "sin-neto-fiable" }
  | { kind: "no-auditable"; motivo: "el-precio-guardado-es-pvp" }
  | { kind: "ok"; ratio: number }
  | { kind: "aviso"; ratio: number; belowCost: boolean };

/**
 * Veredicto para UN override.
 *
 * El orden importa: "no auditable" se decide ANTES de calcular el ratio. Para un
 * proveedor cuyo neto guardado es en realidad el PVP, `clientCents === netCents`
 * y el ratio sale 1,00 — por debajo de WARN_RATIO, así que el watchdog avisaba
 * cada semana de los 59 productos de Adivin (13-jul → 17-ago-2026, seis avisos
 * seguidos a Telegram, todos falsos). No están bien ni mal: no se pueden medir
 * sin su coste de compra, y decir eso es distinto de callarlo.
 */
export function evaluarDrift(o: DriftInput): DriftVerdict {
  if (!o.active) return { kind: "ignorado", motivo: "inactivo" };
  if (o.netCents <= 0 || o.clientCents <= 0)
    return { kind: "ignorado", motivo: "sin-neto-fiable" };
  if (PRECIO_GUARDADO_ES_PVP.includes(o.supplier))
    return { kind: "no-auditable", motivo: "el-precio-guardado-es-pvp" };

  const ratio = o.clientCents / o.netCents;
  if (ratio < WARN_RATIO) return { kind: "aviso", ratio, belowCost: ratio < 1 };
  return { kind: "ok", ratio };
}
