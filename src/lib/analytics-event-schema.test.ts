/**
 * `/api/analytics/event` es una ruta PÚBLICA y anónima: la llama el browser
 * con sendBeacon y lo que llegue se persiste tal cual en una columna JSON.
 *
 * Todos sus campos tenían `.max()` menos `payload`, que era un
 * `z.record(z.string(), z.unknown())` sin acotar: cabía un objeto arbitrario.
 * Estos tests fijan el tope por TAMAÑO, nunca por contenido, y lo hacen por
 * arriba y por abajo para que nadie lo relaje sin enterarse.
 *
 * Los topes salen de medir producción (39.580 eventos, 16-may → 18-ago): el
 * payload real más grande son 240 bytes y el máximo de claves, 3.
 */
import { describe, it, expect } from "vitest";
import {
  AnalyticsEventSchema,
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_KEYS,
} from "./analytics-event-schema";

/** Evento con la forma que manda hoy el browser en un pageview. */
function evento(over: Record<string, unknown> = {}) {
  return {
    type: "pageview",
    path: "/catalogo/camiseta-basica",
    sessionId: "sess_abc123",
    payload: { referrer: "https://www.google.com", variant: "b" },
    ...over,
  };
}

describe("AnalyticsEventSchema", () => {
  it("acepta el evento normal que manda el browser", () => {
    expect(AnalyticsEventSchema.safeParse(evento()).success).toBe(true);
  });

  it("acepta un evento sin payload (es opcional)", () => {
    const { payload: _payload, ...sinPayload } = evento();
    expect(AnalyticsEventSchema.safeParse(sinPayload).success).toBe(true);
  });

  it("acepta un payload del tamaño real máximo medido en producción (240 bytes)", () => {
    const real = { referrer: "x".repeat(230) };
    expect(AnalyticsEventSchema.safeParse(evento({ payload: real })).success).toBe(true);
  });

  it("RECHAZA el payload gigante que motivó el arreglo", () => {
    const gigante = { blob: "x".repeat(5 * 1024 * 1024) };
    expect(AnalyticsEventSchema.safeParse(evento({ payload: gigante })).success).toBe(false);
  });

  it("acepta justo por debajo del tope y rechaza justo por encima", () => {
    // `{"k":"…"}` — el relleno se calcula para caer a ambos lados del tope.
    const envoltorio = JSON.stringify({ k: "" }).length;
    const cabe = { k: "x".repeat(MAX_PAYLOAD_BYTES - envoltorio) };
    const noCabe = { k: "x".repeat(MAX_PAYLOAD_BYTES - envoltorio + 1) };
    expect(JSON.stringify(cabe).length).toBe(MAX_PAYLOAD_BYTES);
    expect(AnalyticsEventSchema.safeParse(evento({ payload: cabe })).success).toBe(true);
    expect(AnalyticsEventSchema.safeParse(evento({ payload: noCabe })).success).toBe(false);
  });

  it("acepta el máximo de claves y rechaza una más", () => {
    const enTope = Object.fromEntries(
      Array.from({ length: MAX_PAYLOAD_KEYS }, (_, i) => [`k${i}`, 1]),
    );
    const unaMas = Object.fromEntries(
      Array.from({ length: MAX_PAYLOAD_KEYS + 1 }, (_, i) => [`k${i}`, 1]),
    );
    expect(AnalyticsEventSchema.safeParse(evento({ payload: enTope })).success).toBe(true);
    expect(AnalyticsEventSchema.safeParse(evento({ payload: unaMas })).success).toBe(false);
  });

  it("rechaza una clave más larga que el tope, aunque el objeto sea pequeño", () => {
    const clavota = { ["k".repeat(61)]: 1 };
    expect(AnalyticsEventSchema.safeParse(evento({ payload: clavota })).success).toBe(false);
  });

  it("un objeto anidado también cuenta para el tope de tamaño", () => {
    const anidado = { data: { deep: { deeper: "x".repeat(MAX_PAYLOAD_BYTES) } } };
    expect(AnalyticsEventSchema.safeParse(evento({ payload: anidado })).success).toBe(false);
  });

  it("sigue exigiendo los topes que ya tenían los demás campos", () => {
    expect(AnalyticsEventSchema.safeParse(evento({ type: "" })).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse(evento({ type: "t".repeat(61) })).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse(evento({ path: "/".repeat(501) })).success).toBe(false);
    expect(AnalyticsEventSchema.safeParse(evento({ sessionId: "s".repeat(61) })).success).toBe(false);
  });
});
