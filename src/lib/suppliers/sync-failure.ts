/**
 * Cierre garantizado de la fila de `SupplierSync` cuando un sync revienta.
 *
 * `runXxxSync()` abre la fila del proveedor (`finishedAt = null, ok = false`)
 * en su primer paso y la cierra en el último. Entre medias hay descargas de
 * feeds de decenas de MB, parseos y miles de upserts: si algo de eso lanza, la
 * función sale por excepción y **la fila se queda abierta para siempre**, que
 * es indistinguible de «el sync sigue corriendo» (ver `stalled-sync.ts`).
 *
 * Esto no convierte un fallo en éxito: deja la fila cerrada con `ok = false` y
 * el mensaje del error, para que el histórico y el `cron-watchdog` puedan
 * distinguir «falló» de «colgado», y relanza el error al llamante.
 *
 * **El caso que esto NO cubría, y por el que existe el tope de tiempo de
 * abajo**: un sync que no lanza ni termina, sino que se queda esperando una
 * promesa que jamás se asienta. Sin excepción no hay `catch`, así que la fila
 * se queda abierta indefinidamente. Pasó de verdad el 28-ago-2026: `makito`
 * arrancó a las 04:02Z, escribió 3.200 de sus 4.479 productos, y a las 04:06Z
 * dejó de avanzar — más de dos horas después seguía sin cerrar, con Postgres
 * sin una sola consulta en espera y el proceso Node dormido. Un `await`
 * colgado, no un fallo. El cron de la noche siguiente se lo encontró así.
 */

/**
 * Tope por defecto para un sync completo. Los tres proveedores tardan entre 4
 * y 15 min cuando están sanos (histórico de `SupplierSyncRun`), así que 45 min
 * deja holgura de sobra para un feed lento o una noche cargada: sólo salta
 * cuando algo está roto de verdad, no cuando va lento.
 */
export const SYNC_TIMEOUT_MS = 45 * 60 * 1000;

/**
 * Se relanza al llamante como cualquier otro fallo del sync, pero con tipo
 * propio para poder distinguir en el histórico «reventó» de «se quedó
 * colgado»: la causa y el arreglo no son los mismos.
 */
export class SyncTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(label: string, timeoutMs: number) {
    super(
      `${label}: abortado por el tope de ${Math.round(timeoutMs / 60000)} min sin terminar`,
    );
    this.name = "SyncTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Lo que se escribe en la fila para darla por cerrada-con-fallo. */
export type FailedSyncRow = {
  finishedAt: Date;
  ok: false;
  errorsJson: { ref: string; message: string }[];
};

/**
 * Escritura de la fila. Se pasa como función (y no el cliente Prisma entero)
 * porque el `where` de `SupplierSync` tiene dos claves únicas y su tipo generado
 * no admite un equivalente estructural escrito a mano; así el llamante conserva
 * los tipos de Prisma y el test no necesita mockear nada.
 */
export type SupplierSyncWriter = (row: FailedSyncRow) => Promise<unknown>;

/** El mensaje del error, ya recortado para que no reviente la columna JSON. */
export function syncFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, 500);
}

/**
 * Marca la fila del proveedor como fallada. **Nunca lanza**: se llama desde un
 * `catch`, y si la BD tampoco responde el error que importa es el original.
 * Devuelve `true` si consiguió escribir.
 */
export async function closeFailedSync(
  write: SupplierSyncWriter,
  error: unknown,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    await write({
      finishedAt: now,
      ok: false,
      errorsJson: [{ ref: "_abortado", message: syncFailureMessage(error) }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta un sync garantizando que su fila queda cerrada si revienta **o si se
 * cuelga**.
 *
 * Es la pieza que se cablea en `runXxxSync()`: el éxito pasa intacto (el propio
 * sync ya cierra su fila con las estadísticas buenas) y el fallo deja
 * `finishedAt` puesto y `ok = false` antes de relanzar. El error **siempre** se
 * relanza: quien llama decide qué hacer con él.
 *
 * ⚠️ **Lo que el tope hace y lo que no**: al vencer, cierra la fila y devuelve
 * el control con un `SyncTimeoutError`. No puede *matar* el trabajo colgado —
 * en JavaScript no se cancela una promesa ajena—, así que esa tarea sigue viva
 * hasta que el proceso muera. Lo que se recupera es la observabilidad: el
 * `cron-watchdog` ve un fallo con su hora en vez de un «sigue corriendo» eterno,
 * y el cron de la noche siguiente no se encuentra la fila de ayer abierta.
 */
export async function withSyncFailureClosing<T>(
  label: string,
  write: SupplierSyncWriter,
  run: () => Promise<T>,
  timeoutMs: number = SYNC_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const limite = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new SyncTimeoutError(label, timeoutMs)), timeoutMs);
      // Un sync sano termina antes: el timer no debe ser el motivo de que el
      // proceso siga vivo esperándolo.
      timer.unref?.();
    });
    return await Promise.race([run(), limite]);
  } catch (e) {
    console.error(`[${label}] ABORTADO:`, syncFailureMessage(e));
    await closeFailedSync(write, e);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
