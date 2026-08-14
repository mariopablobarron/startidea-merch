/**
 * Qué panel de boceto se le enseña al visitante en una ficha de producto.
 *
 * Contexto (medido en producción el 14-ago-2026): de **9.591 productos activos,
 * 613 no tienen ninguna `MarkingPosition`** (6,4 %). En esas fichas el
 * `MockupGenerator` devolvía `null` de golpe — y con él desaparecía también el
 * formulario de «te lo hacemos nosotros» (Capa D), que vive dentro del mismo
 * componente. La ficha, en cambio, promete **sin condición**:
 *
 *     «Boceto con tu logo gratis antes de producir — apruébalo tú primero»
 *
 * Es decir: 613 fichas prometían un boceto gratis y no había ningún sitio donde
 * pedirlo. La promesa es verdadera (el equipo hace el mockup técnico sin cobrar,
 * y `/api/mockup-request` acepta `positionId` nulo), lo que faltaba era el flujo.
 *
 * La decisión sale aquí en vez de quedarse como un `positions.length === 0` suelto
 * dentro del componente por el motivo de siempre en este repo: dentro de un `.tsx`
 * no se puede testear, y este `if` es justo el que se equivocó.
 *
 * - `completo`: hay zonas de marcaje ⇒ previsualización automática + Capa D.
 * - `solo-peticion`: no hay zonas ⇒ **no** se puede simular dónde va el logo, pero
 *   sí pedir el boceto al equipo. Se enseña solo la Capa D.
 *
 * Nunca se devuelve «nada»: mientras la ficha prometa el boceto, tiene que haber
 * una vía de pedirlo.
 */
export type MockupPanelMode = "completo" | "solo-peticion";

export function decideMockupPanelMode(positionCount: number): MockupPanelMode {
  // Defensivo con basura (NaN, negativo, no entero): ante la duda, la vía que
  // siempre funciona es pedírselo al equipo.
  if (!Number.isFinite(positionCount) || positionCount < 1) return "solo-peticion";
  return "completo";
}

/** Cabecera del panel. En `solo-peticion` no se puede prometer una simulación visual. */
export function mockupPanelHeading(mode: MockupPanelMode): {
  kicker: string;
  title: string;
  body: string;
} {
  if (mode === "solo-peticion") {
    return {
      kicker: "— Boceto con tu logo, gratis",
      title: "Te preparamos el boceto con tu logo.",
      body:
        "Este producto no tiene zonas de marcaje precargadas, así que la previsualización " +
        "automática no aplica. Lo hace el equipo a mano, con medidas exactas y técnica " +
        "recomendada, y te lo envía para que lo apruebes antes de producir nada.",
    };
  }
  return {
    kicker: "— Previsualización rápida",
    title: "Sube tu logo y mira cómo encaja.",
    body:
      "Es una simulación visual aproximada — el mockup técnico final lo prepara el " +
      "fabricante con dimensiones exactas y se valida contigo antes de producir.",
  };
}
