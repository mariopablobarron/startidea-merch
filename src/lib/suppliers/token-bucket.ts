/**
 * Token bucket genérico para rate-limiting client-side.
 *
 * Uso típico: cada `consume()` espera a tener un token disponible. El bucket
 * se rellena de forma continua a `refillPerSec` hasta `capacity`. Si está
 * vacío, las llamadas a `consume()` esperan; no devuelven 429.
 *
 * Aislado de cualquier dependencia para poder tener instancias por
 * proveedor (Makito, MidOcean…) y testearse sin red.
 */
export type TokenBucketOptions = {
  capacity: number;
  refillPerMinute: number;
  /** Inyectable para testing — default Date.now */
  now?: () => number;
  /** Inyectable para testing — default setTimeout */
  sleep?: (ms: number) => Promise<void>;
};

export type TokenBucket = {
  consume(): Promise<void>;
  status(): { tokens: number; capacity: number; refillPerMinute: number };
  /** Para tests: setea tokens y timestamp manualmente. */
  __setStateForTesting?: (tokens: number, lastRefillAt: number) => void;
};

export function createTokenBucket(opts: TokenBucketOptions): TokenBucket {
  const { capacity, refillPerMinute } = opts;
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));

  const refillPerMs = refillPerMinute / 60_000;

  let tokens = capacity;
  let lastRefillAt = now();

  function refill(): void {
    const t = now();
    const elapsed = t - lastRefillAt;
    if (elapsed <= 0) return;
    tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
    lastRefillAt = t;
  }

  async function consume(): Promise<void> {
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    const needed = 1 - tokens;
    const waitMs = Math.ceil(needed / refillPerMs) + 50;
    await sleep(waitMs);
    return consume();
  }

  return {
    consume,
    status() {
      refill();
      return {
        tokens: Math.floor(tokens),
        capacity,
        refillPerMinute,
      };
    },
    __setStateForTesting(t, ts) {
      tokens = t;
      lastRefillAt = ts;
    },
  };
}
