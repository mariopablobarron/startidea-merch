import { NextResponse } from "next/server";
import { getIndexNowKey } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sirve la API key de IndexNow en una ruta estable conocida.
 * IndexNow acepta cualquier URL en el campo `keyLocation` del POST,
 * así que usamos `/indexnow.txt` para evitar capturar otras rutas
 * de la raíz.
 *
 *   GET /indexnow.txt → text/plain con el contenido de INDEXNOW_KEY
 *
 * Si INDEXNOW_KEY no está configurada en env, responde 404.
 */
export async function GET() {
  const key = getIndexNowKey();
  if (!key) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
