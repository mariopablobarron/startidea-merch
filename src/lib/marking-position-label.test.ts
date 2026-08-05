import { describe, it, expect } from "vitest";
import {
  isGenericPositionId,
  genericZoneNumber,
  formatPositionSize,
  positionOptionLabel,
  describeSinglePosition,
  standalonePositionLabel,
} from "./marking-position-label";

/**
 * Los códigos de estos tests son los REALES del catálogo, contados en producción
 * el 2026-08-04 (top 30 de `MarkingPosition.positionId`). El objetivo es que la
 * frontera entre «no dice nada» e «informa» esté fijada por test y no por
 * intuición: meter `SIDE 1` o `360` en el saco de genéricas borraría información
 * buena, y dejar fuera `Area 1` deja el ruido que motivó el cambio.
 */

const GENERICAS_REALES = ["DEFAULT", "Area 1", "Area 2", "Area 5", "Area 9"];
const INFORMATIVAS_REALES = [
  "FRONT",
  "BACK",
  "SIDE 1",
  "SIDE 2",
  "ROUNDSCREEN",
  "TOP",
  "Cara A",
  "Centrado cara B",
  "LID",
  "CHEST",
  "360",
  "ARM RIGHT",
  "Alrededor del bidón",
  "BARREL RIGHT HANDED",
];

describe("isGenericPositionId", () => {
  it("marca como genéricos los códigos reales que no dicen dónde va el logo", () => {
    for (const code of GENERICAS_REALES) {
      expect(isGenericPositionId(code), code).toBe(true);
    }
  });

  it("NO toca los códigos reales que sí informan", () => {
    for (const code of INFORMATIVAS_REALES) {
      expect(isGenericPositionId(code), code).toBe(false);
    }
  });

  it("aguanta variantes de formato del mismo código genérico", () => {
    expect(isGenericPositionId("  area 1  ")).toBe(true);
    expect(isGenericPositionId("AREA_2")).toBe(true);
    expect(isGenericPositionId("Zona 3")).toBe(true);
    expect(isGenericPositionId("Position 1")).toBe(true);
    expect(isGenericPositionId("POS-4")).toBe(true);
    expect(isGenericPositionId("default")).toBe(true);
  });

  it("un código vacío o ausente cuenta como genérico (no hay nada que decir)", () => {
    expect(isGenericPositionId("")).toBe(true);
    expect(isGenericPositionId("   ")).toBe(true);
    expect(isGenericPositionId(null)).toBe(true);
    expect(isGenericPositionId(undefined)).toBe(true);
  });

  it("no confunde una zona informativa que ACABA en número con una genérica", () => {
    // `SIDE 1` sí dice dónde (un lateral); `360` es todo el contorno.
    expect(isGenericPositionId("SIDE 1")).toBe(false);
    expect(isGenericPositionId("360")).toBe(false);
  });
});

describe("genericZoneNumber", () => {
  it("conserva el número que puso el proveedor", () => {
    expect(genericZoneNumber("Area 3")).toBe(3);
    expect(genericZoneNumber("AREA_12")).toBe(12);
  });

  it("devuelve null cuando la zona genérica no lleva número", () => {
    expect(genericZoneNumber("DEFAULT")).toBeNull();
    expect(genericZoneNumber("FRONT")).toBeNull();
  });
});

describe("formatPositionSize", () => {
  it("compone el área cuando están las dos medidas", () => {
    expect(formatPositionSize({ positionId: "X", maxWidthMm: 100, maxHeightMm: 80 })).toBe(
      "100×80 mm",
    );
  });

  it("no inventa un área si falta una medida", () => {
    expect(formatPositionSize({ positionId: "X", maxWidthMm: 100, maxHeightMm: null })).toBeNull();
    expect(formatPositionSize({ positionId: "X", maxHeightMm: 80 })).toBeNull();
    expect(formatPositionSize({ positionId: "X" })).toBeNull();
  });

  it("una medida de 0 o negativa no es un área (enseñarla sería mentir)", () => {
    expect(formatPositionSize({ positionId: "X", maxWidthMm: 0, maxHeightMm: 80 })).toBeNull();
    expect(formatPositionSize({ positionId: "X", maxWidthMm: 100, maxHeightMm: -5 })).toBeNull();
  });

  it("los decimales salen con coma, como el resto de cifras en castellano", () => {
    expect(formatPositionSize({ positionId: "X", maxWidthMm: 100.5, maxHeightMm: 80 })).toBe(
      "100,5×80 mm",
    );
  });
});

describe("positionOptionLabel (listas: siempre hay que poder elegir)", () => {
  it("respeta el nombre legible cuando el código informa", () => {
    expect(positionOptionLabel({ positionId: "FRONT" }, 0)).toBe("Frontal");
    expect(positionOptionLabel({ positionId: "ROUNDSCREEN" }, 2)).toBe("Lateral · serigrafía rotativa");
  });

  it("castellaniza la zona genérica numerada SIN renumerarla", () => {
    // Si el proveedor manda Area 4 y Area 7, el cliente ve Área 4 y Área 7:
    // renumerar por posición haría que dijera «la 2» y el pedido guardara otra.
    expect(positionOptionLabel({ positionId: "Area 4" }, 0)).toBe("Área 4");
    expect(positionOptionLabel({ positionId: "Area 7" }, 1)).toBe("Área 7");
  });

  it("la genérica sin número cae al orden de la lista, nunca a «Default»", () => {
    expect(positionOptionLabel({ positionId: "DEFAULT" }, 0)).toBe("Zona 1");
    expect(positionOptionLabel({ positionId: "DEFAULT" }, 3)).toBe("Zona 4");
  });

  it("nunca devuelve vacío ni el texto crudo para ningún código real del catálogo", () => {
    for (const [i, code] of [...GENERICAS_REALES, ...INFORMATIVAS_REALES].entries()) {
      const label = positionOptionLabel({ positionId: code }, i);
      expect(label.length, code).toBeGreaterThan(1);
      expect(label, code).not.toMatch(/^Default$/i);
      expect(label, code).not.toMatch(/^Area \d+$/);
    }
  });
});

describe("describeSinglePosition (prosa: mejor callar que decir «Default»)", () => {
  it("DEFAULT sin medidas —el caso de 1.991 productos— no da NADA que escribir", () => {
    expect(describeSinglePosition({ positionId: "DEFAULT" })).toEqual({ zone: null, size: null });
  });

  it("una zona genérica con medidas se enseña por su área, no por su nombre", () => {
    expect(
      describeSinglePosition({ positionId: "Area 1", maxWidthMm: 100, maxHeightMm: 80 }),
    ).toEqual({ zone: null, size: "100×80 mm" });
  });

  it("una zona que informa conserva nombre y medidas", () => {
    expect(
      describeSinglePosition({ positionId: "FRONT", maxWidthMm: 250, maxHeightMm: 300 }),
    ).toEqual({ zone: "Frontal", size: "250×300 mm" });
  });

  it("una zona que informa sin medidas se queda solo con el nombre", () => {
    expect(describeSinglePosition({ positionId: "BACK" })).toEqual({
      zone: "Trasera",
      size: null,
    });
  });
});

describe("standalonePositionLabel (zona suelta: email de mockup, agente de voz)", () => {
  it("«DEFAULT» no llega al cliente: sin lista no hay número honesto que darle", () => {
    expect(standalonePositionLabel("DEFAULT")).toBeNull();
    expect(standalonePositionLabel("default")).toBeNull();
    expect(standalonePositionLabel("N/A")).toBeNull();
  });

  it("conserva el número del proveedor, que es el que el cliente eligió en la ficha", () => {
    expect(standalonePositionLabel("Area 3")).toBe("Área 3");
    expect(standalonePositionLabel("AREA_2")).toBe("Área 2");
    expect(standalonePositionLabel("Zona 5")).toBe("Área 5");
  });

  it("los códigos que informan se traducen igual que en la ficha", () => {
    expect(standalonePositionLabel("FRONT")).toBe("Frontal");
    expect(standalonePositionLabel("ROUNDSCREEN")).toBe("Lateral · serigrafía rotativa");
    expect(standalonePositionLabel("LEFT CHEST")).toBe("Pecho izquierdo");
  });

  it("sin zona (el formulario de mockup no la exige) no inventa ninguna", () => {
    expect(standalonePositionLabel(null)).toBeNull();
    expect(standalonePositionLabel(undefined)).toBeNull();
    expect(standalonePositionLabel("   ")).toBeNull();
  });

  it("ninguna etiqueta que salga al cliente contiene la palabra cruda del feed", () => {
    for (const code of [...GENERICAS_REALES, ...INFORMATIVAS_REALES]) {
      const label = standalonePositionLabel(code);
      if (label === null) continue;
      expect(label, code).not.toMatch(/default/i);
    }
  });
});
