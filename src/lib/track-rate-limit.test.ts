import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRACK_LIMITS, trackRateLimit, type TrackBucket } from "./track-rate-limit";

/** POST equivalente al que hace el navegador, con la IP en x-forwarded-for. */
function post(ip: string) {
  return new Request("https://merchandising.startidea.es/api/track/referrer", {
    method: "POST",
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

/** Gasta `n` peticiones del bucket y devuelve la última respuesta. */
function hit(bucket: TrackBucket, ip: string, n: number) {
  let last = trackRateLimit(post(ip), bucket);
  for (let i = 1; i < n; i++) last = trackRateLimit(post(ip), bucket);
  return last;
}

describe("cupos de /api/track/*", () => {
  it("las tres rutas de tracking tienen cupo", () => {
    expect(Object.keys(TRACK_LIMITS).sort()).toEqual([
      "track-experiment-event",
      "track-product-event",
      "track-referrer",
    ]);
  });

  it("deja pasar el uso legítimo hasta el tope", () => {
    const res = hit("track-referrer", "203.0.113.10", TRACK_LIMITS["track-referrer"].max);
    expect(res.ok).toBe(true);
  });

  it("la petición que pasa del tope se corta con 429", () => {
    const bucket: TrackBucket = "track-referrer";
    const ip = "203.0.113.11";
    hit(bucket, ip, TRACK_LIMITS[bucket].max);
    const extra = trackRateLimit(post(ip), bucket);
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.response.status).toBe(429);
  });

  it("el cupo es por IP: otro cliente no paga el bucle del vecino", () => {
    const bucket: TrackBucket = "track-referrer";
    hit(bucket, "203.0.113.12", TRACK_LIMITS[bucket].max + 5);
    expect(trackRateLimit(post("203.0.113.13"), bucket).ok).toBe(true);
  });

  it("cada bucket cuenta por separado", () => {
    hit("track-referrer", "203.0.113.14", TRACK_LIMITS["track-referrer"].max + 5);
    expect(trackRateLimit(post("203.0.113.14"), "track-product-event").ok).toBe(true);
  });

  it("product-event aguanta una navegación real del catálogo (60 productos)", () => {
    const res = hit("track-product-event", "203.0.113.15", 60);
    expect(res.ok).toBe(true);
    expect(TRACK_LIMITS["track-product-event"].max).toBeGreaterThanOrEqual(60);
  });

  it("referrer es el más estricto: solo se manda 1 vez por sesión", () => {
    expect(TRACK_LIMITS["track-referrer"].max).toBeLessThan(
      TRACK_LIMITS["track-product-event"].max,
    );
  });
});

/**
 * Guard por descubrimiento: recorre `src/app/api/track` en vez de comprobar una
 * lista escrita a mano, para que una ruta de tracking **nueva** sin cupo también
 * tumbe la suite. Un cupo que no está cableado en el handler no protege nada.
 */
describe("toda ruta de /api/track está cableada al cupo", () => {
  const dir = path.join(process.cwd(), "src/app/api/track");
  const routes = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, "route.ts"))
    .filter((f) => fs.existsSync(f));

  it("hay rutas que vigilar", () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(routes)("%s llama a trackRateLimit y corta antes de tocar la BD", (file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain('from "@/lib/track-rate-limit"');
    const call = src.indexOf("trackRateLimit(req");
    expect(call).toBeGreaterThan(-1);
    expect(src).toContain("if (!rl.ok) return rl.response;");
    // El corte va por delante de cualquier await del handler (BD, parseo, …).
    const firstAwait = src.indexOf("await", src.indexOf("export async function POST"));
    expect(call).toBeLessThan(firstAwait);
  });
});
