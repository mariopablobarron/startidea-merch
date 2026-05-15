import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove Background — DESACTIVADO 2026-05.
 *
 * El endpoint `/v1/ai/remove-background` documentado en magnific.com no está
 * disponible en la API pública (404 con key válida vs. 401 con key inválida).
 * Mantengo la route para no romper enlaces externos pero devuelve 501.
 *
 * Cuando Magnific habilite la feature, restaurar desde git log o usar API
 * alternativa (remove.bg / photoroom).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Endpoint remove-background no disponible en Magnific API pública. Usa Mystic con prompt o herramientas externas (remove.bg, photoroom).",
    },
    { status: 501 },
  );
}
