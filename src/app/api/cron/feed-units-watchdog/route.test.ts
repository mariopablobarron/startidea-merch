/**
 * Tests para POST /api/cron/feed-units-watchdog.
 *
 * El recuento se prueba en `auditoria-unidades-feed.test.ts`. Aquí se vigila
 * lo propio de la ruta: que sin secreto no toque la base de datos, y que el
 * anti-spam no acabe tragándose el aviso que justifica todo el cron.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const notifyAdmins = vi.fn();
const requireCronSecret = vi.fn();
const auditarUnidadesFeed = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminSetting: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));
vi.mock("@/lib/notify-admin", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));
vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));
vi.mock("@/lib/auditoria-unidades-feed", () => ({
  auditarUnidadesFeed: (...a: unknown[]) => auditarUnidadesFeed(...a),
}));

import { POST } from "./route";

const PETICION = new Request("https://test/api/cron/feed-units-watchdog", { method: "POST" });

function auditoria(total: number) {
  return {
    generadaEn: "2026-09-06T20:00:00.000Z",
    umbrales: { stockMinimoPlausible: 10, areaMinimaMm: 5 },
    mirado: { variantesActivas: 1000, posicionesDeMarcaje: 500 },
    hallazgos: {
      stockImplausible: total,
      areaMarcajeImplausible: 0,
      tramosImplausibles: 0,
      total,
    },
    muestras: { stock: [], area: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCronSecret.mockReturnValue({ ok: true });
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({});
  auditarUnidadesFeed.mockResolvedValue(auditoria(0));
});

describe("POST /api/cron/feed-units-watchdog", () => {
  it("sin el secreto devuelve 401 y NO consulta el catálogo", async () => {
    requireCronSecret.mockReturnValue({ ok: false, status: 401, reason: "sin secreto" });
    const res = await POST(PETICION);
    expect(res.status).toBe(401);
    expect(auditarUnidadesFeed).not.toHaveBeenCalled();
  });

  it("el primer hallazgo avisa", async () => {
    auditarUnidadesFeed.mockResolvedValue(auditoria(7));
    const res = await POST(PETICION);
    expect(res.status).toBe(200);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect((await res.json()).notified).toBe(true);
  });

  it("si ya había hallazgos en la pasada anterior, no vuelve a avisar", async () => {
    findUnique.mockResolvedValue({ value: 7 });
    auditarUnidadesFeed.mockResolvedValue(auditoria(9));
    const res = await POST(PETICION);
    expect(notifyAdmins).not.toHaveBeenCalled();
    const cuerpo = await res.json();
    expect(cuerpo.notified).toBe(false);
    // Pero no se calla: el informe sigue diciendo que hay 9 valores rotos.
    expect(cuerpo.hallazgos.total).toBe(9);
  });

  it("un catálogo sano no avisa", async () => {
    const res = await POST(PETICION);
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect((await res.json()).notified).toBe(false);
  });

  it("tras un catálogo sano, el siguiente hallazgo vuelve a avisar", async () => {
    // El anti-spam guarda el recuento; si se guardara solo cuando hay
    // hallazgos, un problema resuelto dejaría el contador alto y el siguiente
    // fallo llegaría en silencio. Esto comprueba que el 0 se persiste.
    await POST(PETICION);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 0 } }),
    );

    vi.clearAllMocks();
    requireCronSecret.mockReturnValue({ ok: true });
    upsert.mockResolvedValue({});
    findUnique.mockResolvedValue({ value: 0 });
    auditarUnidadesFeed.mockResolvedValue(auditoria(4));
    await POST(PETICION);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("guarda el recuento nuevo para el flanco de la próxima pasada", async () => {
    auditarUnidadesFeed.mockResolvedValue(auditoria(12));
    await POST(PETICION);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: 12 } }),
    );
  });

  it("el informe viaja entero en la respuesta: es lo que queda en el log de Actions", async () => {
    auditarUnidadesFeed.mockResolvedValue(auditoria(3));
    const cuerpo = await (await POST(PETICION)).json();
    expect(cuerpo.mirado).toEqual({ variantesActivas: 1000, posicionesDeMarcaje: 500 });
    expect(cuerpo.umbrales).toEqual({ stockMinimoPlausible: 10, areaMinimaMm: 5 });
    expect(cuerpo.muestras).toBeDefined();
  });
});
