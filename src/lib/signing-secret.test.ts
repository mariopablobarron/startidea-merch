import { describe, it, expect } from "vitest";
import { resolveSigningSecret } from "./signing-secret";

/**
 * Este helper decide si un guardián de acceso puede trabajar o no.
 * El caso que lo motiva es real: en producción no existía ninguna de las envs
 * y se estaba firmando con un literal que vive en un repositorio público.
 */
describe("resolveSigningSecret", () => {
  const devFallback = "dev-only-lo-que-sea";

  it("usa la primera env con valor, respetando el orden de preferencia", () => {
    expect(
      resolveSigningSecret({
        candidates: ["preferida", "segunda"],
        devFallback,
        isProduction: true,
      }),
    ).toBe("preferida");

    expect(
      resolveSigningSecret({
        candidates: [undefined, "segunda"],
        devFallback,
        isProduction: true,
      }),
    ).toBe("segunda");
  });

  it("EN PRODUCCIÓN sin ninguna env devuelve null, nunca el literal", () => {
    // El invariante entero del arreglo: fallar cerrado.
    expect(
      resolveSigningSecret({
        candidates: [undefined, undefined],
        devFallback,
        isProduction: true,
      }),
    ).toBeNull();
  });

  it("fuera de producción sí cae al literal, para no configurar nada en local", () => {
    expect(
      resolveSigningSecret({
        candidates: [undefined],
        devFallback,
        isProduction: false,
      }),
    ).toBe(devFallback);
  });

  it("una env vacía o en blanco NO cuenta como secreto", () => {
    // Un `SECRET=` suelto en un .env es exactamente cómo se cuela un
    // despliegue inseguro sin que nadie lo note.
    for (const vacia of ["", "   ", "\n"]) {
      expect(
        resolveSigningSecret({
          candidates: [vacia],
          devFallback,
          isProduction: true,
        }),
      ).toBeNull();

      expect(
        resolveSigningSecret({
          candidates: [vacia, "de-verdad"],
          devFallback,
          isProduction: true,
        }),
      ).toBe("de-verdad");
    }
  });

  it("sin lista de candidatas se comporta igual que con todas vacías", () => {
    expect(
      resolveSigningSecret({ candidates: [], devFallback, isProduction: true }),
    ).toBeNull();
  });
});
