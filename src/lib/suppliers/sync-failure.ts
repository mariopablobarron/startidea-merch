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
 */

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
 * Ejecuta un sync garantizando que su fila queda cerrada si revienta.
 *
 * Es la pieza que se cablea en `runXxxSync()`: el éxito pasa intacto (el propio
 * sync ya cierra su fila con las estadísticas buenas) y el fallo deja
 * `finishedAt` puesto y `ok = false` antes de relanzar. El error **siempre** se
 * relanza: quien llama decide qué hacer con él.
 */
export async function withSyncFailureClosing<T>(
  label: string,
  write: SupplierSyncWriter,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[${label}] ABORTADO:`, syncFailureMessage(e));
    await closeFailedSync(write, e);
    throw e;
  }
}
