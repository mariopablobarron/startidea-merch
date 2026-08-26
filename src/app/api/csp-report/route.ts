/**
 * POST /api/csp-report — receptor de los informes de la CSP en Report-Only.
 *
 * POR QUÉ EXISTE: la política llevaba semanas en `Content-Security-Policy-
 * Report-Only` **sin `report-uri` ni `report-to`**, así que no informaba a
 * ninguna parte. Los "informes" solo existían si alguien abría la consola de
 * un navegador, a mano, en las páginas que se le ocurriera visitar — y por eso
 * el tramo del CHECKOUT seguía sin medir run tras run: para llegar a
 * `/pay/[token]` hace falta un enlace de pago real. Con un receptor, ese tramo
 * lo mide **el tráfico de clientes reales**, que sí pasa por ahí todos los
 * días, en vez de esperar a fabricar un pago de prueba.
 *
 * Report-Only no bloquea nada: esto no cambia lo que ve ningún cliente, solo
 * empieza a recoger lo que hasta hoy se perdía.
 *
 * CÓMO LEERLO (no toca BD a propósito — sin migración, y reversible borrando
 * la ruta y las dos directivas de `next.config.ts`):
 *   ssh root@72.61.195.108 'docker logs merch-app 2>&1 | grep "\[csp-report\]"'
 *
 * Es una ruta PÚBLICA y anónima, así que se trata como tal: tope de tamaño,
 * rate limit por IP y agregación en memoria para que una página con una
 * violación en bucle no llene el disco de logs (el `/var/log` de este VPS ya
 * se llenó una vez, 71 MB de un log sin rotar).
 */
import { NextResponse } from "next/server";
import { parseViolations } from "@/lib/csp-report";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un informe de CSP ronda los 500 B; 16 KB deja margen de sobra y acota el abuso. */
const MAX_BYTES = 16 * 1024;

/** Ventana de agregación: la misma violación se loguea una vez por ventana. */
const AGGREGATE_WINDOW_MS = 10 * 60_000;

type Seen = { count: number; resetAt: number };
const seen = new Map<string, Seen>();

export async function POST(req: Request) {
  // Generoso a propósito: una sola carga de página puede emitir varios
  // informes. Lo que corta es el abuso, no el uso legítimo.
  const rl = rateLimit(req, { key: "csp-report", max: 60, windowMs: 5 * 60_000 });
  if (!rl.ok) return rl.response;

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return new NextResponse(null, { status: 413 });

  let payload: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return new NextResponse(null, { status: 413 });
    payload = JSON.parse(text);
  } catch {
    // Un cuerpo ilegible no es un error del cliente que merezca ruido.
    return new NextResponse(null, { status: 204 });
  }

  const now = Date.now();
  for (const v of parseViolations(payload)) {
    const key = `${v.directive}|${v.blockedUri}|${v.documentUri}`;
    const prev = seen.get(key);
    if (prev && prev.resetAt > now) {
      prev.count += 1;
      continue;
    }
    if (prev) {
      console.warn(
        `[csp-report] (agregado) ${prev.count} repeticiones en los últimos ${
          AGGREGATE_WINDOW_MS / 60_000
        } min · ${key}`,
      );
    }
    seen.set(key, { count: 1, resetAt: now + AGGREGATE_WINDOW_MS });
    console.warn(
      `[csp-report] directiva=${v.directive} bloqueado=${v.blockedUri} pagina=${v.documentUri}`,
    );
  }

  // Barrido de las entradas caducadas: este Map vive en el proceso.
  if (seen.size > 500) {
    for (const [k, s] of seen.entries()) if (s.resetAt < now) seen.delete(k);
  }

  // 204 siempre: el navegador no espera cuerpo y no hay nada que contarle.
  return new NextResponse(null, { status: 204 });
}
