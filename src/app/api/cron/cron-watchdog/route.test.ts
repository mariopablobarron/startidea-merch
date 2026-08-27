/**
 * Tests para POST /api/cron/cron-watchdog.
 *
 * Cubre detección de silenciosos, fallos y la lógica anti-spam.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const findMany = vi.fn();
const notifyAdmins = vi.fn();
const requireCronSecret = vi.fn();

// Catálogo mockeado como array mutable: por defecto vacío (preserva el
// comportamiento de los tests existentes, que solo conocían listCronNames).
// Los tests de la "red de seguridad" empujan entradas aquí.
// `scheduleCron` es opcional aquí a propósito: las entradas reales del catálogo
// siempre lo llevan, pero los tests que no lo declaran comprueban justo el caso
// del cron que aún no tiene disparador declarado.
const catalogEntries: { name: string; scheduleCron?: string }[] = [];
vi.mock("@/lib/cron-catalog", () => ({
  // Getter en vez de asignación directa: el factory de vi.mock se ejecuta
  // hoisted (antes de que corra `const catalogEntries = []`), así que una
  // referencia directa dispara TDZ. El getter difiere la lectura hasta el
  // primer acceso real (dentro del handler, ya con todo inicializado).
  get CRON_CATALOG() {
    return catalogEntries;
  },
  findCron: (name: string) => catalogEntries.find((c) => c.name === name) ?? null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

vi.mock("@/lib/notify-admin", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

// El módulo cron-tracking tiene su propio mock de prisma — uso vi.mock
// del módulo entero para controlar lo que devuelve.
vi.mock("@/lib/cron-tracking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-tracking")>(
    "@/lib/cron-tracking",
  );
  return {
    ...actual,
    listCronNames: vi.fn(),
    getCronHistory: vi.fn(),
    wrapCronHandler: (_name: string, h: (r: Request) => Promise<Response>) => h,
  };
});

import { listCronNames, getCronHistory } from "@/lib/cron-tracking";
import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/cron/cron-watchdog", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

const NOW = new Date("2026-06-03T12:00:00Z").getTime();

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
  findMany.mockReset();
  notifyAdmins.mockReset();
  requireCronSecret.mockReset();
  requireCronSecret.mockReturnValue({ ok: true });
  vi.mocked(listCronNames).mockReset();
  vi.mocked(getCronHistory).mockReset();
  catalogEntries.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("POST /api/cron/cron-watchdog", () => {
  it("401 si cron-secret inválido", async () => {
    requireCronSecret.mockReturnValueOnce({ ok: false, status: 401, reason: "Bad" });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("sin crons trackeados → no alerta", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(0);
    expect(data.issuesCount).toBe(0);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("excluye self del check (cron-watchdog)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([
      "cron-watchdog",
      "ai-usage-alert",
    ]);
    vi.mocked(getCronHistory).mockImplementation(async () => [
      {
        at: new Date(NOW - 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(1); // solo ai-usage-alert
    expect(data.statuses).toHaveLength(1);
    expect(data.statuses[0].name).toBe("ai-usage-alert");
  });

  it("silencioso si lleva > expectedHours sin ejecutar", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    // 48h sin run, umbral 30h
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toContain("ai-usage-alert");
    expect(data.notified).toBe(true);
    expect(notifyAdmins).toHaveBeenCalledOnce();
    const call = notifyAdmins.mock.calls[0][0];
    expect(call.title).toMatch(/cron.*problema/i);
    expect(call.url).toBe("/admin/insights/crons");
  });

  it("failing si última run no fue OK aunque sea reciente", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 60_000).toISOString(), // 1 min hace
        elapsedMs: 50,
        ok: false,
        status: 500,
        error: "boom",
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.failing).toContain("ai-usage-alert");
    expect(data.silent).toEqual([]);
    expect(data.notified).toBe(true);
  });

  it("anti-spam: misma lista que ayer → no alerta de nuevo", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    // BD ya recordaba este como problema, avisado hace 2h
    findUnique.mockResolvedValueOnce({
      value: { names: ["ai-usage-alert"], at: new Date(NOW - 2 * 3_600_000).toISOString() },
    });
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.issuesCount).toBe(1);
    expect(data.notified).toBe(false);
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it("pero un problema que SIGUE ahí se recuerda pasadas 72h (no se olvida)", async () => {
    // El anti-spam anterior solo comparaba listas: mientras el problema no
    // cambiara, no volvía a avisarse jamás. Con `cifra-sync` parado desde el
    // 26-jul eso significó un aviso único y luego silencio, con el catálogo y
    // los precios de un proveedor entero congelados.
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({
      value: { names: ["ai-usage-alert"], at: new Date(NOW - 96 * 3_600_000).toISOString() },
    });
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.notified).toBe(true);
    expect(data.notifyReason).toBe("persistente");
    expect(notifyAdmins).toHaveBeenCalledOnce();
    expect(notifyAdmins.mock.calls[0][0].title).toContain("SIGUE");
  });

  it("lee el estado ANTIGUO (array plano, lo que hay hoy en producción) sin perder la lista", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] }); // formato viejo
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    // Sin fecha no se sabe cuándo se avisó → recuerda una vez y ya queda con
    // fecha para las siguientes.
    expect(data.notified).toBe(true);
    const stored = upsert.mock.calls[0][0].update.value;
    expect(stored.names).toEqual(["ai-usage-alert"]);
    expect(typeof stored.at).toBe("string");
  });

  it("anti-spam: lista distinta → sí alerta", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([
      "ai-usage-alert",
      "metric-snapshot",
    ]);
    vi.mocked(getCronHistory).mockImplementation(async (name) => [
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] }); // ayer solo uno
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.notified).toBe(true);
    expect(notifyAdmins).toHaveBeenCalledOnce();
  });

  it("cron sin historial no se considera silencioso (es nuevo)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["new-cron"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toEqual([]);
    expect(data.issuesCount).toBe(0);
    expect(data.notified).toBe(false);
  });

  it("limpia memoria si todo está OK ahora pero antes había issues", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 60_000).toISOString(), // reciente
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce({ value: ["ai-usage-alert"] }); // antes había problema
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.notified).toBe(false);
    expect(upsert).toHaveBeenCalledOnce(); // limpia
    const stored = upsert.mock.calls[0][0].update.value;
    expect(stored).toEqual({ names: [], at: null });
  });

  it("metric-snapshot es diario: 3h sin correr NO es motivo de alarma", async () => {
    // Antes su umbral era 2h ("cada hora"), pero metric-snapshot.yml corre
    // `35 3 * * *`. Con 2h se marcaba como parado ~22h de cada 24 y ese ruido
    // acompañaba a todos los avisos reales.
    vi.mocked(listCronNames).mockResolvedValueOnce(["metric-snapshot"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 3 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    const resOk = await POST(makeReq());
    const dataOk = await resOk.json();
    expect(dataOk.silent).toEqual([]);
    expect(dataOk.notified).toBe(false);
  });

  it("metric-snapshot parado de verdad (2 días) sí se detecta", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["metric-snapshot"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 48 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toContain("metric-snapshot");
  });

  it("red de seguridad: cron del catálogo sin NINGUNA run cuenta como candidato a silencioso (no invisible)", async () => {
    // "never-ran-cron" está en el catálogo pero listCronNames() no lo devuelve
    // porque jamás ha registrado una ejecución (no existe key cron_runs_*).
    catalogEntries.push({ name: "never-ran-cron" });
    vi.mocked(listCronNames).mockResolvedValueOnce([]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([]); // sin historia
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(1);
    expect(data.silent).toContain("never-ran-cron");
    const status = data.statuses.find((s: { name: string }) => s.name === "never-ran-cron");
    expect(status.lastRunAt).toBeNull();
    expect(status.silent).toBe(true);
    expect(data.notified).toBe(true);
  });

  it("un cron del catálogo SIN disparador no genera falsa alarma por silencio", async () => {
    // Caso real: `publish-scheduled` anunciaba `*/5 * * * *` pero no existe ni
    // línea de crontab ni workflow que lo llame, así que salía como "parado" en
    // todos los avisos y nadie podía cerrarlo nunca.
    catalogEntries.push({ name: "sin-disparador", scheduleCron: "—" });
    vi.mocked(listCronNames).mockResolvedValueOnce([]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([]);
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toEqual([]);
    expect(data.notified).toBe(false);
    expect(data.unwatched).toEqual([
      { name: "sin-disparador", reason: "no tiene disparador programado" },
    ]);
  });

  it("un cron no vigilado por silencio SÍ avisa si su última ejecución falló", async () => {
    // No se ignora el cron: se ignora su silencio.
    catalogEntries.push({ name: "sin-disparador", scheduleCron: "—" });
    vi.mocked(listCronNames).mockResolvedValueOnce(["sin-disparador"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([
      {
        at: new Date(NOW - 240 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: false,
        status: 500,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.silent).toEqual([]);
    expect(data.failing).toContain("sin-disparador");
    expect(data.notified).toBe(true);
  });

  it("lo que cuesta dinero va primero en el mensaje (el push se trunca a 280)", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce([
      "ai-usage-alert",
      "cifra-sync",
    ]);
    vi.mocked(getCronHistory).mockImplementation(async () => [
      {
        at: new Date(NOW - 240 * 3_600_000).toISOString(),
        elapsedMs: 100,
        ok: true,
        status: 200,
      },
    ]);
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    await POST(makeReq());
    const body = notifyAdmins.mock.calls[0][0].body as string;
    expect(body.indexOf("cifra-sync")).toBeLessThan(body.indexOf("ai-usage-alert"));
    expect(body).toContain("🔴"); // marcado como crítico
  });

  it("cron trackeado (con historia vacía por edge case) sigue tratándose como 'nuevo', no silencioso, aunque esté también en el catálogo", async () => {
    catalogEntries.push({ name: "ai-usage-alert" });
    vi.mocked(listCronNames).mockResolvedValueOnce(["ai-usage-alert"]);
    vi.mocked(getCronHistory).mockResolvedValueOnce([]); // historia vacía (race/edge)
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.totalTracked).toBe(1); // union no duplica
    expect(data.silent).toEqual([]);
    expect(data.notified).toBe(false);
  });

  // --- Auto-chequeo del propio watchdog -------------------------------------
  // Antes se excluía de todo chequeo ("no notificarnos a nosotros mismos") y su
  // disparador podía fallar sin que nadie lo supiera. Caso real: 2026-08-27.
  function historyBy(map: Record<string, { at: string; ok?: boolean }[]>) {
    vi.mocked(getCronHistory).mockImplementation(async (name: string) =>
      (map[name] ?? []).map((r) => ({
        at: r.at,
        elapsedMs: 100,
        ok: r.ok ?? true,
        status: r.ok === false ? 500 : 200,
      })),
    );
  }
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

  it("avisa cuando su PROPIO disparador se saltó un run, aunque todo lo demás esté bien", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["cifra-sync"]);
    historyBy({
      "cifra-sync": [{ at: hoursAgo(2) }],
      "cron-watchdog": [{ at: hoursAgo(34.7) }], // se saltó el run diario
    });
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.selfCheck).toEqual({
      hoursSinceLastRun: 34.7,
      expectedHours: 30,
      late: true,
    });
    expect(data.silent).toContain("cron-watchdog");
    expect(data.notified).toBe(true);
    const body = notifyAdmins.mock.calls[0][0].body as string;
    expect(body).toContain("🕐 watchdog tarde");
    // El aviso tiene que decir que TODO lo demás llega con ese retraso: leerlo
    // como una foto de ahora mismo es justo la confusión que se busca evitar.
    expect(body).toContain("retraso");
  });

  it("si el watchdog viene puntual no se menciona a sí mismo", async () => {
    vi.mocked(listCronNames).mockResolvedValueOnce(["cifra-sync"]);
    historyBy({
      "cifra-sync": [{ at: hoursAgo(2) }],
      "cron-watchdog": [{ at: hoursAgo(24) }],
    });
    findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    const data = await res.json();
    expect(data.selfCheck.late).toBe(false);
    expect(data.silent).toEqual([]);
    expect(data.notified).toBe(false);
  });

  it("su propio retraso no desplaza a los crons que cuestan dinero", async () => {
    // El push se trunca a 280 caracteres: el sync de proveedor sigue primero.
    vi.mocked(listCronNames).mockResolvedValueOnce(["cifra-sync"]);
    historyBy({
      "cifra-sync": [{ at: hoursAgo(240) }],
      "cron-watchdog": [{ at: hoursAgo(34.7) }],
    });
    findUnique.mockResolvedValueOnce(null);
    upsert.mockResolvedValueOnce({});
    await POST(makeReq());
    const body = notifyAdmins.mock.calls[0][0].body as string;
    expect(body.indexOf("cifra-sync")).toBeLessThan(body.indexOf("cron-watchdog"));
  });
});
