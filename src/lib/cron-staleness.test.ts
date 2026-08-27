import { describe, it, expect } from "vitest";
import {
  expectedHoursFor,
  silenceWatchability,
  sortBySeverity,
  decideWatchdogAlert,
  parseWatchdogAlertState,
  REALERT_AFTER_HOURS,
  CRITICAL_CRONS,
  evaluateWatchdogSelfRun,
} from "./cron-staleness";
import { CRON_CATALOG } from "./cron-catalog";

/**
 * Se testea contra el CRON_CATALOG REAL (no mockeado) para fijar los umbrales
 * de verdad. Si alguien cambia la frecuencia de un cron en el catálogo, estos
 * valores cambian con él — que es justo lo que queremos (una sola fuente de
 * verdad).
 */
describe("expectedHoursFor — umbral de silencio del cron-watchdog", () => {
  it("cron del catálogo: deriva de frequencyHours × 2", () => {
    // midocean-sync = diario (24h) en CRON_CATALOG.
    expect(expectedHoursFor("midocean-sync")).toBe(48);
  });

  it("REGRESIÓN: un cron semanal del catálogo ya NO cae al default 30h", () => {
    // override-price-drift = semanal (168h). Antes: 30h → falsa alarma cada
    // semana durante ~5 días. Ahora holgura sobre la ejecución semanal.
    const h = expectedHoursFor("override-price-drift");
    expect(h).toBe(336);
    expect(h).toBeGreaterThan(168);
  });

  it("cron de alta frecuencia del catálogo: umbral pequeño (detección rápida, no 30h)", () => {
    // webhook-retry = cada 15 min (0.25h) en CRON_CATALOG.
    expect(expectedHoursFor("webhook-retry")).toBe(0.5);
  });

  it("override manual (cron de GitHub Actions, no en el catálogo) gana sobre la derivación", () => {
    expect(expectedHoursFor("insights-digest")).toBe(8 * 24);
  });

  it("REGRESIÓN: metric-snapshot es DIARIO, no horario", () => {
    // metric-snapshot.yml → `35 3 * * *`. El override decía 2h ("cada hora"),
    // así que un cron que corre una vez al día se marcaba como parado ~22h de
    // cada 24: era falsa alarma casi permanente, y ese ruido tapaba los avisos
    // reales dentro del mismo mensaje.
    const h = expectedHoursFor("metric-snapshot");
    expect(h).toBe(30);
    expect(h).toBeGreaterThan(24);
  });

  it("cron desconocido (ni override ni catálogo) → default 30h", () => {
    expect(expectedHoursFor("cron-inventado-que-no-existe")).toBe(30);
  });

  it("cualquier cron del catálogo obtiene un umbral > 0 y finito", () => {
    // Blindaje: ningún cron del catálogo debe quedar con umbral 0/NaN.
    for (const name of ["makito-sync", "cifra-sync", "voice-agent-health", "backup-db"]) {
      const h = expectedHoursFor(name);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });
});

describe("silenceWatchability — a quién tiene sentido vigilar por silencio", () => {
  it("un cron con disparador real SÍ se vigila", () => {
    expect(silenceWatchability("cifra-sync")).toEqual({ watchable: true });
    expect(silenceWatchability("midocean-sync").watchable).toBe(true);
  });

  it("backup-db NO se vigila por silencio: lo dispara el bash del host", () => {
    // El crontab del VPS lo dice literalmente ("El backup-db NO está aquí").
    // La ruta HTTP nunca se llama de forma periódica, así que su silencio es lo
    // esperado y avisar de él es una alarma que nadie puede cerrar.
    const w = silenceWatchability("backup-db");
    expect(w.watchable).toBe(false);
    expect(w.watchable === false && w.reason).toMatch(/backup-merch\.sh/);
  });

  it("un cron sin disparador programado (scheduleCron '—') NO se vigila", () => {
    // improve-descriptions: sin línea de crontab ni workflow. Nunca ha
    // registrado una ejecución y nunca la registrará.
    const w = silenceWatchability("improve-descriptions");
    expect(w.watchable).toBe(false);
    expect(w.watchable === false && w.reason).toMatch(/disparador/);
  });

  it("REGRESIÓN: publish-scheduled dejó de anunciar un disparador que no existe", () => {
    // El catálogo declaraba `*/5 * * * *`, pero no hay crontab ni workflow que
    // lo llame; el resultado era un "cron parado" permanente en cada aviso.
    const entry = CRON_CATALOG.find((c) => c.name === "publish-scheduled");
    expect(entry?.scheduleCron).toBe("—");
    expect(silenceWatchability("publish-scheduled").watchable).toBe(false);
  });

  it("embeddings-sync SÍ se vigila: tiene workflow diario en GitHub Actions", () => {
    // Corrección en la dirección contraria: el catálogo lo daba por "—" y lo
    // dejaba sin vigilar, cuando embeddings-sync.yml corre `0 5 * * *`.
    const entry = CRON_CATALOG.find((c) => c.name === "embeddings-sync");
    expect(entry?.scheduleCron).toBe("0 5 * * *");
    expect(silenceWatchability("embeddings-sync").watchable).toBe(true);
  });

  it("un cron fuera del catálogo (GitHub Actions) se vigila por defecto", () => {
    expect(silenceWatchability("metric-snapshot").watchable).toBe(true);
  });
});

describe("sortBySeverity — lo que cuesta dinero, primero", () => {
  it("los crons críticos van delante de los demás", () => {
    const out = sortBySeverity([
      "publish-scheduled",
      "insights-digest",
      "cifra-sync",
      "backup-db",
    ]);
    expect(out[0]).toBe("cifra-sync");
  });

  it("dentro de cada grupo el orden es alfabético y estable", () => {
    expect(sortBySeverity(["makito-sync", "cifra-sync"])).toEqual([
      "cifra-sync",
      "makito-sync",
    ]);
    expect(sortBySeverity(["zeta", "alfa"])).toEqual(["alfa", "zeta"]);
  });

  it("los tres syncs de proveedor son críticos (congelan precio y stock)", () => {
    for (const n of ["cifra-sync", "midocean-sync", "makito-sync"]) {
      expect(CRITICAL_CRONS.has(n)).toBe(true);
    }
  });

  it("no pierde ni duplica elementos", () => {
    const input = ["a", "cifra-sync", "b", "webhook-retry"];
    const out = sortBySeverity(input);
    expect(out.slice().sort()).toEqual(input.slice().sort());
  });
});

describe("decideWatchdogAlert — avisar sin spamear, pero sin enmudecer", () => {
  const NOW = Date.parse("2026-07-29T00:00:00.000Z");

  it("sin problemas no avisa", () => {
    const d = decideWatchdogAlert({
      currentNames: [],
      lastNames: ["cifra-sync"],
      lastAlertAt: "2026-07-28T00:00:00.000Z",
      nowMs: NOW,
    });
    expect(d).toEqual({ notify: false, reason: "sin-issues" });
  });

  it("una lista distinta a la última avisa (hay algo nuevo)", () => {
    const d = decideWatchdogAlert({
      currentNames: ["cifra-sync", "makito-sync"],
      lastNames: ["cifra-sync"],
      lastAlertAt: "2026-07-28T23:00:00.000Z",
      nowMs: NOW,
    });
    expect(d).toEqual({ notify: true, reason: "lista-nueva" });
  });

  it("la misma lista recién avisada calla (anti-spam diario)", () => {
    const d = decideWatchdogAlert({
      currentNames: ["cifra-sync"],
      lastNames: ["cifra-sync"],
      lastAlertAt: "2026-07-28T22:00:00.000Z", // hace 2h
      nowMs: NOW,
    });
    expect(d).toEqual({ notify: false, reason: "ya-avisado" });
  });

  it("EL BUG QUE ARREGLA: un problema que sigue ahí se recuerda, no se olvida", () => {
    // Con el anti-spam anterior (solo comparación de conjuntos) esto devolvía
    // "no avisar" para siempre: cifra-sync llevaba desde el 26-jul parado, con
    // los precios de 2.513 productos congelados, y el watchdog callado.
    const d = decideWatchdogAlert({
      currentNames: ["cifra-sync"],
      lastNames: ["cifra-sync"],
      lastAlertAt: "2026-07-25T00:00:00.000Z", // hace 96h
      nowMs: NOW,
    });
    expect(d).toEqual({ notify: true, reason: "persistente" });
  });

  it("el recordatorio salta justo al cruzar el umbral, no antes", () => {
    const justBefore = new Date(NOW - (REALERT_AFTER_HOURS - 1) * 3_600_000);
    const justAfter = new Date(NOW - REALERT_AFTER_HOURS * 3_600_000);
    expect(
      decideWatchdogAlert({
        currentNames: ["x"],
        lastNames: ["x"],
        lastAlertAt: justBefore.toISOString(),
        nowMs: NOW,
      }).notify,
    ).toBe(false);
    expect(
      decideWatchdogAlert({
        currentNames: ["x"],
        lastNames: ["x"],
        lastAlertAt: justAfter.toISOString(),
        nowMs: NOW,
      }).notify,
    ).toBe(true);
  });

  it("el orden de la lista no cuenta como cambio", () => {
    const d = decideWatchdogAlert({
      currentNames: ["b", "a"],
      lastNames: ["a", "b"],
      lastAlertAt: "2026-07-28T22:00:00.000Z",
      nowMs: NOW,
    });
    expect(d.notify).toBe(false);
  });

  it("sin fecha de último aviso (estado en formato antiguo) avisa una vez", () => {
    // Lo que hay hoy en producción es un array plano sin fecha. Preferimos un
    // recordatorio de más al desplegar que seguir mudos ante algo ya abierto.
    const d = decideWatchdogAlert({
      currentNames: ["cifra-sync"],
      lastNames: ["cifra-sync"],
      lastAlertAt: null,
      nowMs: NOW,
    });
    expect(d).toEqual({ notify: true, reason: "persistente" });
  });

  it("una fecha corrupta no bloquea el aviso", () => {
    const d = decideWatchdogAlert({
      currentNames: ["cifra-sync"],
      lastNames: ["cifra-sync"],
      lastAlertAt: "no-es-una-fecha",
      nowMs: NOW,
    });
    expect(d.notify).toBe(true);
  });
});

describe("parseWatchdogAlertState — compatibilidad con el estado ya guardado", () => {
  it("lee el formato ANTIGUO (array plano) sin perder los nombres", () => {
    // Formato real en producción a 2026-07-29.
    expect(parseWatchdogAlertState(["cifra-sync", "metric-snapshot"])).toEqual({
      names: ["cifra-sync", "metric-snapshot"],
      at: null,
    });
  });

  it("lee el formato nuevo con fecha", () => {
    expect(
      parseWatchdogAlertState({ names: ["cifra-sync"], at: "2026-07-28T12:48:16.237Z" }),
    ).toEqual({ names: ["cifra-sync"], at: "2026-07-28T12:48:16.237Z" });
  });

  it("descarta basura sin lanzar", () => {
    expect(parseWatchdogAlertState(null)).toEqual({ names: [], at: null });
    expect(parseWatchdogAlertState("texto")).toEqual({ names: [], at: null });
    expect(parseWatchdogAlertState({ names: [1, "ok", null] })).toEqual({
      names: ["ok"],
      at: null,
    });
  });
});

describe("evaluateWatchdogSelfRun — el watchdog vigilando su propio disparador", () => {
  const NOW = Date.UTC(2026, 7, 27, 16, 6, 0);
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

  it("un run diario puntual (24h) NO es tarde", () => {
    const r = evaluateWatchdogSelfRun(hoursAgo(24), NOW);
    expect(r.silent).toBe(false);
    expect(r.hoursSinceLastRun).toBe(24);
  });

  it("el caso real del 2026-08-27: el planificador de GitHub se saltó el run", () => {
    // Ejecución anterior: 26-ago 11:19Z. Si el run de las 11:00 del 27 no sale
    // y el siguiente llega retrasado, el hueco pasa de 30h y hay que decirlo.
    const r = evaluateWatchdogSelfRun(hoursAgo(34.7), NOW);
    expect(r.silent).toBe(true);
    expect(r.expectedHours).toBe(30);
  });

  it("sin historia previa NO avisa (puede ser el primer run tras un deploy)", () => {
    expect(evaluateWatchdogSelfRun(null, NOW)).toEqual({
      silent: false,
      hoursSinceLastRun: null,
      expectedHours: 30,
    });
  });

  it("una fecha corrupta no lanza ni inventa un aviso", () => {
    const r = evaluateWatchdogSelfRun("no soy una fecha", NOW);
    expect(r.silent).toBe(false);
    expect(r.hoursSinceLastRun).toBeNull();
  });
});
