/**
 * IndexNow — protocolo abierto para notificar a buscadores cuando una URL
 * cambia. Soportado por Bing, Yandex, Seznam, Naver y DuckDuckGo (DDG usa
 * Bing como backend). No es Google.
 *
 * No requiere service account ni verificación OAuth: solo una API key
 * arbitraria que debe ser servible desde el propio dominio para probar
 * propiedad (similar a un HTML verification file).
 *
 * Setup:
 *   1. Generar una key aleatoria (32 chars hex es lo típico)
 *   2. Añadir al .env del VPS:
 *        INDEXNOW_KEY=<key generada>
 *   3. El endpoint /<key>.txt o /indexnow.txt sirve la key (Next 15
 *      route handler), probando que el dominio te pertenece.
 *
 * Mismo endpoint funciona para todos los motores compatibles —
 * api.indexnow.org redistribuye internamente.
 */

const INDEXNOW_URL = "https://api.indexnow.org/indexnow";

export type IndexNowResult = {
  ok: boolean;
  status: number;
  message?: string;
  urlsSubmitted: number;
};

export function isIndexNowConfigured(): boolean {
  return !!process.env.INDEXNOW_KEY;
}

export function getIndexNowKey(): string | null {
  return process.env.INDEXNOW_KEY ?? null;
}

/**
 * Notifica a IndexNow (Bing/Yandex/DDG/...) que las URLs han cambiado.
 * Hasta 10.000 URLs por request. Devuelve un solo resultado agregado.
 *
 * Códigos de respuesta esperados de IndexNow:
 *   200 — todas las URLs aceptadas
 *   202 — aceptadas, validación de key pendiente
 *   400 — request malformado
 *   403 — key no validada (no servible desde el host)
 *   422 — URLs no del host declarado
 *   429 — rate limit
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return {
      ok: false,
      status: 503,
      message: "IndexNow no configurado (falta INDEXNOW_KEY)",
      urlsSubmitted: 0,
    };
  }
  if (urls.length === 0) {
    return { ok: true, status: 200, urlsSubmitted: 0 };
  }
  if (urls.length > 10_000) {
    urls = urls.slice(0, 10_000);
  }

  // Inferir host del primer URL
  let host: string;
  try {
    host = new URL(urls[0]).host;
  } catch {
    return {
      ok: false,
      status: 400,
      message: "URL inválida",
      urlsSubmitted: 0,
    };
  }

  // Servimos la key en /indexnow.txt (ver app/indexnow.txt/route.ts).
  // IndexNow acepta cualquier URL aquí, no exige <key>.txt en la raíz.
  const keyLocation = `https://${host}/indexnow.txt`;

  try {
    const res = await fetch(INDEXNOW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
    });
    const txt = await res.text().catch(() => "");
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      message: txt.slice(0, 300) || undefined,
      urlsSubmitted: urls.length,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : "network error",
      urlsSubmitted: 0,
    };
  }
}
