/**
 * Resuelve el secreto con el que se firman enlaces y tokens de acceso.
 *
 * Existe porque el patrón «cae a un literal si falta la env» estaba escrito
 * dos veces en el repo y en producción se estaba usando de verdad: ni
 * PROPOSAL_SIGN_SECRET ni NEXTAUTH_SECRET existían, así que los enlaces de
 * propuesta —los que abren el PDF con los precios del cliente y los que
 * aceptan la propuesta en su nombre— se firmaban con una cadena que está
 * escrita en un repositorio público.
 *
 * La regla es la de `affiliate-magic.ts`, que ya lo hacía bien: en producción,
 * sin un secreto de verdad NO se firma y NO se verifica. Un guardián de acceso
 * tiene que fallar cerrado; si falla abierto deja de ser un guardián.
 *
 * Fuera de producción sí se devuelve el literal de desarrollo, para no obligar
 * a configurar nada en local ni en los tests.
 */
export function resolveSigningSecret(opts: {
  /** Envs candidatas, en orden de preferencia. */
  candidates: (string | undefined)[];
  /** Literal a usar SOLO fuera de producción. */
  devFallback: string;
  /** Inyectable para poder testear ambos entornos. */
  isProduction?: boolean;
}): string | null {
  const encontrado = opts.candidates.find(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  if (encontrado) return encontrado;

  const enProduccion = opts.isProduction ?? process.env.NODE_ENV === "production";
  // Sin secreto real en producción: nada que firmar y nada que dar por válido.
  return enProduccion ? null : opts.devFallback;
}
