import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard **por descubrimiento**: no compara contra una lista de proveedores
 * conocidos —eso sólo probaría que no vuelve lo viejo—, sino que recorre el
 * directorio, se queda con todo `runXxxSync()` exportado y exige que pase por
 * `withSyncFailureClosing`. Un proveedor nuevo mañana entra solo en el barrido.
 *
 * Por qué importa: ese envoltorio es lo único que cierra la fila de
 * `SupplierSync` cuando el sync revienta **o se cuelga**. Sin él, la fila se
 * queda con `finishedAt = null` y es indistinguible de «sigue corriendo»: el
 * 28-ago-2026 `makito` pasó así más de dos horas, y `midocean` y `cifra` no
 * tenían el envoltorio en absoluto — no se les había caído, simplemente nadie
 * los había cableado.
 */

const DIR = join(process.cwd(), "src/lib/suppliers");

/**
 * Excluir uno es legítimo, pero pasa por escribir aquí el motivo — no por
 * borrarlo del barrido en silencio.
 */
const EXCLUIDOS_A_PROPOSITO: Record<string, string> = {};

function ficherosDeSync(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith("-sync.ts") && !f.endsWith(".test.ts"))
    .sort();
}

/** Los `export async function runXxxSync(` de un fichero. */
function syncsExportados(codigo: string): string[] {
  return [...codigo.matchAll(/export\s+async\s+function\s+(run\w*Sync)\s*\(/g)].map((m) => m[1]);
}

describe("todo sync de proveedor cierra su fila pase lo que pase", () => {
  it("hay syncs que vigilar (si esto falla, el barrido dejó de encontrar nada)", () => {
    const encontrados = ficherosDeSync().flatMap((f) =>
      syncsExportados(readFileSync(join(DIR, f), "utf8")),
    );
    expect(encontrados.length).toBeGreaterThanOrEqual(3);
  });

  it("cada runXxxSync exportado delega en withSyncFailureClosing", () => {
    const sinCierre: string[] = [];

    for (const fichero of ficherosDeSync()) {
      if (EXCLUIDOS_A_PROPOSITO[fichero]) continue;
      const codigo = readFileSync(join(DIR, fichero), "utf8");

      for (const nombre of syncsExportados(codigo)) {
        const inicio = codigo.indexOf(`export async function ${nombre}(`);
        // El cuerpo llega hasta la siguiente declaración de nivel superior.
        const resto = codigo.slice(inicio);
        const fin = resto.indexOf("\n}\n");
        const cuerpo = fin === -1 ? resto : resto.slice(0, fin);
        if (!cuerpo.includes("withSyncFailureClosing(")) {
          sinCierre.push(`${fichero} → ${nombre}()`);
        }
      }
    }

    expect(
      sinCierre,
      `Estos syncs dejarían su fila de SupplierSync abierta para siempre si ` +
        `revientan o se cuelgan. Envuélvelos en withSyncFailureClosing (ver ` +
        `makito-sync.ts) o justifica la excepción en EXCLUIDOS_A_PROPOSITO:\n` +
        sinCierre.join("\n"),
    ).toEqual([]);
  });

  it("no quedan exclusiones que apunten a ficheros que ya no existen", () => {
    const existentes = new Set(ficherosDeSync());
    const muertas = Object.keys(EXCLUIDOS_A_PROPOSITO).filter((f) => !existentes.has(f));
    expect(muertas, `Exclusiones caducadas: ${muertas.join(", ")}`).toEqual([]);
  });
});
