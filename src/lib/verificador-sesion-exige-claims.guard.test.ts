import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD ESTÁTICO — un verificador de sesión no puede reconstruir una
 * identidad a partir de los claims sin EXIGIRLOS.
 *
 * Es el 7º guard del repo y cubre el hueco que dejaron los otros seis: todos
 * vigilan qué SALE (imagen de proveedor, texto de proveedor, secreto a
 * literal, pedido sin cerrojo…), ninguno vigilaba la FORMA de un verificador
 * de identidad.
 *
 * El patrón prohibido, que ya ha aparecido DOS veces en este repo el mismo
 * día (`customer-auth.ts` y `admin-auth.ts`):
 *
 *     const { payload } = await jwtVerify(token, secret);
 *     return { userId: String(payload.userId || ""), role: payload.role as X };
 *
 * Verificar la firma no es autenticar. Mientras los tres tipos de token
 * caigan al mismo `ADMIN_SECRET`, el `jwtVerify` de un token de cliente pasa
 * en el verificador de admin; lo único que los distingue son los claims. Un
 * objeto con campos vacíos es TRUTHY y satisface cualquier `if (!session)`.
 *
 * La regla: si un fichero llama a `jwtVerify` y devuelve un objeto a partir
 * del `payload`, tiene que haber antes una comprobación explícita de claims.
 */

const LIB = join(process.cwd(), "src", "lib");

/** Colapsa saltos de línea. NO es cosmético: el caso real del guard de
 *  secretos venía repartido en 4 líneas y una regex por líneas no vio
 *  ninguno de los tres agujeros que había. Misma lección aplicada aquí. */
function colapsar(texto: string): string {
  return texto.replace(/\s+/g, " ");
}

function ficherosQueVerificanJwt(): { nombre: string; ruta: string; codigo: string }[] {
  const candidatos: { nombre: string; ruta: string; codigo: string }[] = [];
  const entradas = [
    ...readdirSync(LIB).map((n) => ({ nombre: n, ruta: join(LIB, n) })),
    { nombre: "middleware.ts", ruta: join(process.cwd(), "src", "middleware.ts") },
  ];
  for (const { nombre, ruta } of entradas) {
    if (!nombre.endsWith(".ts") || nombre.endsWith(".test.ts")) continue;
    let codigo: string;
    try {
      codigo = readFileSync(ruta, "utf8");
    } catch {
      continue; // no es un fichero (directorio) — se ignora
    }
    if (codigo.includes("jwtVerify(")) candidatos.push({ nombre, ruta, codigo });
  }
  return candidatos;
}

/** Formas aceptables de exigir claims antes de devolver la identidad. */
const COMPROBACIONES = [
  "hasAdminClaims",
  "hasCustomerClaims",
  "isAdminRole",
  // verificadores que hacen su propia comprobación explícita
  "if (!partnerId)",
  "Boolean(payload.userId && payload.email)",
];

describe("guard: los verificadores de sesión exigen sus claims", () => {
  it("🛡️ cobertura propia — el guard encuentra los ficheros que debe vigilar", () => {
    // Sin esto, un renombrado que dejara la lista en 0 haría que el guard
    // pasara verde para siempre. Es el modo de fallo silencioso de todo
    // guard estático, y el motivo de que los otros seis lleven lo mismo.
    const ficheros = ficherosQueVerificanJwt();
    expect(
      ficheros.length,
      "el guard no encontró verificadores de JWT: ¿se renombraron los ficheros?",
    ).toBeGreaterThanOrEqual(4);

    const nombres = ficheros.map((f) => f.nombre);
    for (const obligatorio of ["admin-auth.ts", "customer-auth.ts", "affiliate-magic.ts"]) {
      expect(nombres, `falta ${obligatorio} en el barrido`).toContain(obligatorio);
    }
  });

  it("🔒 ninguno devuelve una identidad sin comprobar antes los claims", () => {
    const infractores: string[] = [];

    for (const { nombre, codigo } of ficherosQueVerificanJwt()) {
      const plano = colapsar(codigo);
      // ¿Construye algo a partir del payload? (devolverlo, o castear un campo)
      const usaPayload =
        /return \{[^}]*payload\./.test(plano) || /payload\.\w+ as /.test(plano);
      if (!usaPayload) continue;

      const comprueba = COMPROBACIONES.some((c) => plano.includes(c));
      if (!comprueba) {
        infractores.push(
          `${nombre}: construye una identidad desde el payload sin exigir claims. ` +
            `Usa hasAdminClaims/hasCustomerClaims de session-claims.ts, o comprueba ` +
            `explícitamente los campos y devuelve null si faltan.`,
        );
      }
    }

    expect(infractores, infractores.join("\n")).toEqual([]);
  });

  it("🔬 anti-falso-verde — el guard SÍ caza el código tal y como estaba roto", () => {
    // Sin esto, el guard podría estar comprobando algo que nunca se cumple y
    // pasar verde para siempre. Se le da el código exacto que tenía
    // admin-auth.ts antes del arreglo.
    const roto = colapsar(`
      const { payload } = await jwtVerify(token, secret);
      return {
        userId: String(payload.userId || ""),
        email: String(payload.email || ""),
        role: payload.role as AdminRole,
      };
    `);
    const usaPayload = /return \{[^}]*payload\./.test(roto) || /payload\.\w+ as /.test(roto);
    expect(usaPayload).toBe(true);
    expect(COMPROBACIONES.some((c) => roto.includes(c))).toBe(false);
  });

  it("🔬 y NO marca como infractor el código ya arreglado", () => {
    const arreglado = colapsar(`
      const { payload } = await jwtVerify(token, secret);
      if (!hasAdminClaims(payload)) return null;
      return { userId: String(payload.userId), role: payload.role as AdminRole };
    `);
    expect(COMPROBACIONES.some((c) => arreglado.includes(c))).toBe(true);
  });

  it("🔒 el gate del EDGE comprueba claims, no solo la firma", () => {
    // El middleware es la primera puerta de /admin/* y /clientes/*. Si se
    // conforma con la firma, acepta lo que el servidor rechaza — y las dos
    // puertas dejan de significar lo mismo.
    //
    // ⚠️ Se mira el CABLEADO, no la mera aparición del nombre: la línea de
    // `import` ya contiene ambos identificadores, así que un `toContain` a
    // secas pasa verde aunque se haya quitado el argumento de la llamada.
    // (Lo descubrió la mutación nº4 al escribir este guard: pasaba 5/5 con
    // el middleware ya roto.) Por eso se excluyen las líneas de import y se
    // exige que cada predicado aparezca DENTRO de una llamada a
    // `hasValidJwtCookie`.
    const bruto = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");
    const sinImports = bruto
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("import "))
      .join("\n");

    // `await ` delimita las LLAMADAS: sin él, la propia DEFINICIÓN de
    // hasValidJwtCookie entra en el match (sus parámetros llevan el tipo
    // `(payload: …) => boolean`) y el conteo sale a 3.
    const llamadas = colapsar(sinImports).match(/await hasValidJwtCookie\([^)]*\)/g) ?? [];
    expect(llamadas.length, "el middleware ya no llama a hasValidJwtCookie").toBe(2);

    expect(llamadas.some((c) => c.includes("hasAdminClaims"))).toBe(true);
    expect(llamadas.some((c) => c.includes("hasCustomerClaims"))).toBe(true);
  });
});
