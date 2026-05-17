/**
 * Rate limiter sliding-window in-memory. Suficiente para 1 container Next
 * (el setup actual). Si en algún momento se escala a múltiples instancias,
 * migrar a Upstash Redis / Vercel KV — la API de uso queda igual.
 *
 * Uso:
 *   import { rateLimit } from "@/lib/rate-limit";
 *
 *   export async function POST(req: Request) {
 *     const rl = rateLimit(req, { key: "cart-quote", max: 10, windowMs: 5 * 60_000 });
 *     if (!rl.ok) return rl.response;  // ya viene con 429 + Retry-After + JSON
 *     // … resto del handler
 *   }
 *
 * Heurística clave (IP del cliente): si hay proxy delante, Next pasa el header
 * x-forwarded-for. Cogemos la PRIMERA IP (la del cliente real, no la del proxy).
 * Si no hay header, caemos a x-real-ip y por último a "unknown" (estrictamente
 * limitado, así no engaña).
 */

import { NextResponse } from "next/server";

type Window = { count: number; resetAt: number };

// key → ip → Window. Map en memoria del proceso Node.
const STORES = new Map<string, Map<string, Window>>();

// Limpieza periódica para no leakear memoria con IPs largas inactivas.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;
function sweep() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, store] of STORES.entries()) {
    for (const [ip, win] of store.entries()) {
      if (win.resetAt < now) store.delete(ip);
    }
    if (store.size === 0) STORES.delete(key);
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number; response: NextResponse };

export type RateLimitOpts = {
  /** Identificador del bucket (uno por endpoint o por familia). */
  key: string;
  /** Máximo de requests por ventana. */
  max: number;
  /** Ventana en ms. Ej. 5 * 60_000 = 5 min. */
  windowMs: number;
  /** Override del identificador del cliente (por defecto IP). Ej. email del usuario. */
  identifier?: string;
};

export function rateLimit(req: Request, opts: RateLimitOpts): RateLimitResult {
  sweep();

  const ident = opts.identifier ?? getClientIp(req);
  const now = Date.now();

  let store = STORES.get(opts.key);
  if (!store) {
    store = new Map();
    STORES.set(opts.key, store);
  }

  let win = store.get(ident);
  if (!win || win.resetAt < now) {
    win = { count: 0, resetAt: now + opts.windowMs };
    store.set(ident, win);
  }

  win.count++;
  const remaining = Math.max(0, opts.max - win.count);

  if (win.count > opts.max) {
    const retryAfter = Math.ceil((win.resetAt - now) / 1000);
    return {
      ok: false,
      remaining: 0,
      resetAt: win.resetAt,
      response: NextResponse.json(
        {
          error: "Demasiadas peticiones. Inténtalo más tarde.",
          retryAfterSeconds: retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(opts.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(win.resetAt / 1000)),
          },
        },
      ),
    };
  }

  return { ok: true, remaining, resetAt: win.resetAt };
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
