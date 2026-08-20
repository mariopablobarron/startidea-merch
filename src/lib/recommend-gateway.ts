/**
 * Llamada al gateway de IA (OpenRouter, formato OpenAI-compatible) del
 * recomendador, con reintento y **presupuesto de tiempo compartido**.
 *
 * Vive fuera del route handler por dos razones:
 *  1. Next solo admite en un route los exports que reconoce, así que las
 *     constantes y esta función no pueden vivir allí si se quieren probar.
 *  2. Aquí se puede inyectar `fetch`/reloj y probar por COMPORTAMIENTO el
 *     caso que rompió producción el 20-ago-2026 (ver abajo).
 *
 * 🐛 El fallo que arregla: el route hacía `fetch(..., { signal:
 * AbortSignal.timeout(12_000) })` y, si la respuesta llegaba con cabeceras
 * OK, leía el cuerpo con `await response.json()` **fuera** del try/catch. El
 * signal sigue vivo mientras se lee el cuerpo: con un prompt de 250 productos
 * el modelo tarda más de 12 s en terminar de generar, el abort saltaba
 * durante la lectura y el TimeoutError salía sin capturar ⇒ **500 al cliente**
 * en una superficie pública, justo lo contrario de la degradación elegante
 * que el propio route promete. Aquí la lectura del cuerpo está DENTRO del
 * try, y esta función no lanza nunca: devuelve `{ ok: false, reason }` para
 * que el llamante degrade al catálogo filtrado.
 *
 * Y el presupuesto: 12 s + 14 s en serie podían sumar 26,8 s contra un
 * `maxDuration = 30`. Ahora los dos intentos comparten un presupuesto único
 * (`budgetMs`), así que el segundo solo dispone del tiempo que sobre.
 */

export type AiGatewayJson = {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: Record<string, number>;
  model?: string;
};

export type AiGatewayResult =
  | { ok: true; json: AiGatewayJson }
  | { ok: false; reason: string };

/**
 * Presupuesto total de los dos intentos.
 *
 * Medido en producción el 20-ago-2026 con un prompt del tamaño real (250
 * productos, 30 KB de payload, `max_tokens: 4000`): las **cabeceras llegan a
 * los 2,4 s** y el **cuerpo se termina de generar a los 10,5 s**. Por eso el
 * viejo `AbortSignal.timeout(12_000)` no cortaba la conexión —ya estaba
 * establecida— sino la LECTURA del cuerpo, justo en el borde de la latencia
 * normal: cualquier día algo más lento y saltaba.
 *
 * 18 s da un 70 % de holgura sobre esos 10,5 s y sigue cabiendo, con el resto
 * del handler, dentro de los 20 s que el money smoke tolera por petición
 * (`REQUEST_TIMEOUT_MS`) — si no, el guard marcaría la ruta como caída sin
 * estarlo. Y muy por debajo del `maxDuration = 30` del route.
 */
export const AI_GATEWAY_BUDGET_MS = 18_000;
/** Por debajo de esto no merece la pena reintentar: no da tiempo a generar. */
export const AI_GATEWAY_MIN_ATTEMPT_MS = 4_000;
/** Tope por intento: un modelo que pasa de aquí no va a responder mejor. */
export const AI_GATEWAY_MAX_ATTEMPT_MS = 16_000;
/** Respiro entre intentos ante un fallo transitorio. */
export const AI_GATEWAY_RETRY_DELAY_MS = 800;

export const AI_GATEWAY_URL = "https://openrouter.ai/api/v1/chat/completions";

/** 4xx que no son 429 son culpa nuestra (key, payload): reintentar no arregla. */
function esTransitorio(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function callAiGateway(opts: {
  payload: string;
  apiKey: string;
  siteUrl: string;
  budgetMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<AiGatewayResult> {
  const {
    payload,
    apiKey,
    siteUrl,
    budgetMs = AI_GATEWAY_BUDGET_MS,
    fetchImpl = fetch,
    now = () => Date.now(),
    sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms)),
  } = opts;

  const deadline = now() + budgetMs;
  let lastFailure = "sin intentos";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const restante = deadline - now();
    if (restante < AI_GATEWAY_MIN_ATTEMPT_MS) {
      lastFailure = `sin tiempo para el intento ${attempt} (${Math.max(0, restante)} ms) — ${lastFailure}`;
      break;
    }
    const timeoutMs = Math.min(restante, AI_GATEWAY_MAX_ATTEMPT_MS);

    try {
      const r = await fetchImpl(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": siteUrl,
          "X-Title": "TodoMerchandising",
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (r.ok) {
        // DENTRO del try a propósito: el signal sigue vivo mientras se lee el
        // cuerpo, y un abort aquí es lo que devolvía 500 al cliente.
        const json = (await r.json()) as AiGatewayJson;
        return { ok: true, json };
      }

      const detail = await r.text().catch(() => "");
      lastFailure = `gateway HTTP ${r.status}: ${detail.slice(0, 300)}`;
      if (!esTransitorio(r.status)) break;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : String(err);
    }

    if (attempt === 1 && deadline - now() >= AI_GATEWAY_MIN_ATTEMPT_MS) {
      await sleep(AI_GATEWAY_RETRY_DELAY_MS);
    }
  }

  return { ok: false, reason: lastFailure };
}
