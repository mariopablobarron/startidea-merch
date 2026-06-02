/**
 * POST /api/admin/suppliers/makito/test-b2b
 *
 * Verifica conectividad con la API B2B oficial:
 *   1. Obtiene credenciales activas según AdminSetting `makito_b2b_mode`
 *   2. Hace login → recibe JWT
 *   3. Llama /orders/countries → endpoint barato que valida que el token sirve
 *   4. Devuelve resumen (modo, latencias, conteo de países) — SIN exponer
 *      el JWT ni los secrets, ni en logs
 *
 * Solo admin. No fire-and-forget — devuelve sync para que la UI pinte
 * resultado inmediato.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  getActiveCredentials,
  getCountries,
  getMakitoB2BMode,
  getRateBucketStatus,
} from "@/lib/suppliers/makito-b2b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  // Mostrar el modo aunque falle (útil para diagnóstico)
  const mode = await getMakitoB2BMode();

  // Validar que tenemos credenciales antes de salir a la red
  try {
    await getActiveCredentials();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        stage: "credentials",
        message:
          err instanceof Error
            ? err.message
            : "Credenciales no configuradas en VPS",
      },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  try {
    const countries = await getCountries();
    const elapsedMs = Date.now() - t0;
    const count = Array.isArray(countries) ? countries.length : 0;
    return NextResponse.json({
      ok: true,
      mode,
      elapsedMs,
      countries: count,
      sampleSize: Math.min(3, count),
      sample: Array.isArray(countries) ? countries.slice(0, 3) : null,
      rateBucket: getRateBucketStatus(),
      message: `Login OK + /orders/countries devolvió ${count} entradas en ${elapsedMs} ms`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        stage: "request",
        elapsedMs: Date.now() - t0,
        message: err instanceof Error ? err.message : String(err),
        rateBucket: getRateBucketStatus(),
      },
      { status: 502 },
    );
  }
}
