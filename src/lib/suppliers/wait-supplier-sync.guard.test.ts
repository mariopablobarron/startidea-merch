import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// El guard vive en bash porque corre en el VPS dentro de `deploy.sh`, antes de
// que exista ningún proceso de Node. Se prueba ejecutándolo de verdad con la
// consulta inyectada: probar el bucle es justo el punto, porque lo que falla en
// un guard así es la espera, no la SQL.

const SCRIPT = path.join(process.cwd(), "scripts", "wait-supplier-sync.sh");

/** Crea un stub ejecutable que imprime, en cada llamada, la siguiente línea. */
function stubQuery(respuestas: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "wait-sync-"));
  const contador = path.join(dir, "n");
  writeFileSync(contador, "0");
  const stub = path.join(dir, "query.sh");
  writeFileSync(
    stub,
    [
      "#!/usr/bin/env bash",
      `i=$(cat ${contador})`,
      `echo $((i + 1)) > ${contador}`,
      `respuestas=(${respuestas.map((r) => JSON.stringify(r)).join(" ")})`,
      // Índice explícito: el bash de macOS es 3.2 y no admite `[-1]` (devuelve
      // vacío, que el guard interpreta —bien— como «no sé»; pero entonces el
      // test mediría el fail-open en vez de la espera máxima, que es lo suyo).
      'ultimo=$(( ${#respuestas[@]} - 1 ))',
      'if [ "$i" -lt "${#respuestas[@]}" ]; then idx=$i; else idx=$ultimo; fi',
      'printf "%s\\n" "${respuestas[$idx]}"',
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
  return stub;
}

function correr(
  respuestas: string[],
  env: Record<string, string> = {},
): { code: number; salida: string } {
  try {
    const salida = execFileSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env,
        SYNC_QUERY_CMD: stubQuery(respuestas),
        SYNC_POLL_SECONDS: "1",
        SYNC_WAIT_MAX_SECONDS: "3",
        ...env,
      },
    });
    return { code: 0, salida };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, salida: err.stdout };
  }
}

describe("wait-supplier-sync (guard de deploy)", () => {
  it("sigue de inmediato cuando no hay ningún sync abierto", () => {
    const { code, salida } = correr(["0"]);
    expect(code).toBe(0);
    expect(salida).not.toMatch(/espero/);
  });

  it("espera mientras el sync está en curso y sigue en cuanto cierra", () => {
    const { code, salida } = correr(["1", "1", "0"]);
    expect(code).toBe(0);
    expect(salida).toMatch(/sync\(s\) de proveedor en curso/);
    expect(salida).toMatch(/sync terminado tras 2s/);
  });

  it("se rinde y deja pasar el deploy al agotar la espera máxima", () => {
    const { code, salida } = correr(["1"]);
    expect(code).toBe(0);
    expect(salida).toMatch(/WARN 1 sync\(s\) siguen abiertos tras 3s/);
  });

  // Lo que de verdad no puede pasar: que un guard de conveniencia impida
  // desplegar porque la BD no conteste.
  it("es fail-open si la consulta falla o no devuelve un número", () => {
    for (const respuesta of ["", "psql: error: no such container", "NULL"]) {
      const { code, salida } = correr([respuesta]);
      expect(code).toBe(0);
      expect(salida).toMatch(/fail-open/);
    }
  });

  it("deploy.sh lo invoca ANTES de recrear el contenedor", () => {
    const deploy = readFileSync(
      path.join(process.cwd(), "scripts", "deploy.sh"),
      "utf8",
    );
    const guard = deploy.indexOf("wait-supplier-sync.sh");
    const recreate = deploy.indexOf('log "recreate container"');
    expect(guard).toBeGreaterThan(-1);
    expect(recreate).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(recreate);
  });
});
