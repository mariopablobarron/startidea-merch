import { describe, it, expect } from "vitest";
import { evaluarDrift, PRECIO_GUARDADO_ES_PVP, WARN_RATIO } from "@/lib/override-drift";

const base = { supplier: "makito", active: true, clientCents: 1000, netCents: 500 };

describe("evaluarDrift", () => {
  it("margen sano → ok", () => {
    const v = evaluarDrift(base); // ×2,0
    expect(v.kind).toBe("ok");
  });

  it("margen implícito por debajo del umbral → aviso", () => {
    const v = evaluarDrift({ ...base, clientCents: 600 }); // ×1,2
    expect(v).toMatchObject({ kind: "aviso", belowCost: false });
  });

  it("PVP por debajo del coste → aviso crítico", () => {
    const v = evaluarDrift({ ...base, clientCents: 400 }); // ×0,8
    expect(v).toMatchObject({ kind: "aviso", belowCost: true });
  });

  it("inactivo o sin neto fiable → no se opina", () => {
    expect(evaluarDrift({ ...base, active: false }).kind).toBe("ignorado");
    expect(evaluarDrift({ ...base, netCents: 0 }).kind).toBe("ignorado");
    expect(evaluarDrift({ ...base, clientCents: 0 }).kind).toBe("ignorado");
  });

  /**
   * EL FALLO QUE ESTE FICHERO EXISTE PARA IMPEDIR.
   *
   * Adivin guarda PVP en fromPriceCents, así que su override vale exactamente lo
   * mismo: ratio 1,00, por debajo de WARN_RATIO → aviso. Seis semanas seguidas
   * (13-jul → 17-ago-2026) el cron mandó "59 overrides desfasados" a Telegram,
   * los 59 falsos. No se silencian: se marcan como no auditables.
   */
  it("proveedor cuyo precio guardado es PVP → no auditable, NUNCA aviso", () => {
    for (const supplier of PRECIO_GUARDADO_ES_PVP) {
      const v = evaluarDrift({ supplier, active: true, clientCents: 1700, netCents: 1700 });
      expect(v).toEqual({ kind: "no-auditable", motivo: "el-precio-guardado-es-pvp" });
    }
  });

  it("un proveedor con tarifa real y ratio 1,00 SÍ avisa (la exclusión es por proveedor, no por ratio)", () => {
    const v = evaluarDrift({ ...base, supplier: "cifra", clientCents: 1700, netCents: 1700 });
    expect(v).toMatchObject({ kind: "aviso", belowCost: false });
  });

  it("el umbral sigue siendo coherente con el margen global de 1,6667×", () => {
    // Si alguien sube WARN_RATIO por encima del multiplicador global, TODO
    // producto sin override entraría en aviso: el umbral ha de quedar por debajo.
    expect(WARN_RATIO).toBeLessThan(1.6667);
  });
});
