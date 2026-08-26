/**
 * Lectura de los informes de la CSP. Vive aquí y no en el `route.ts` porque
 * Next **rechaza el build** si un fichero de ruta exporta algo que no sea un
 * handler ("is not a valid Route export field"): ni `tsc` ni los tests lo ven
 * venir, solo el build. Ver `src/app/api/csp-report/route.ts`.
 */
/** Lo que nos interesa de un informe, venga en el formato que venga. */
type Violation = {
  documentUri: string;
  blockedUri: string;
  directive: string;
};

export function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/**
 * Los navegadores mandan DOS formatos distintos y hay que aceptar los dos:
 *   - `application/csp-report` (report-uri): `{ "csp-report": { … } }`,
 *     con claves en kebab-case. Es lo que envían Safari y Firefox.
 *   - `application/reports+json` (report-to): un ARRAY de
 *     `{ type: "csp-violation", body: { … } }` con claves en camelCase.
 *     Es lo que envía Chrome.
 * Quedarse con uno solo deja fuera media base de clientes sin que se note.
 */
export function parseViolations(payload: unknown): Violation[] {
  const out: Violation[] = [];

  const push = (r: Record<string, unknown> | undefined) => {
    if (!r) return;
    const documentUri = str(r["document-uri"] ?? r.documentURL ?? r.documentURI);
    const blockedUri = str(r["blocked-uri"] ?? r.blockedURL ?? r.blockedURI);
    const directive = str(
      r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"],
      100,
    );
    if (!documentUri && !blockedUri && !directive) return;
    out.push({ documentUri, blockedUri, directive });
  };

  if (Array.isArray(payload)) {
    for (const entry of payload.slice(0, 20)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.type && e.type !== "csp-violation") continue;
      push(e.body as Record<string, unknown> | undefined);
    }
    return out;
  }

  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    push((p["csp-report"] ?? p.body ?? p) as Record<string, unknown>);
  }
  return out;
}
