/**
 * Guard: ningún sync de proveedor comparte instante de disparo con otro cron.
 *
 * EL DAÑO QUE ESTE GUARD EXISTE PARA IMPEDIR (medido, no supuesto).
 *
 * Los syncs de catálogo contestan **202 en 0,1 s** y siguen trabajando dentro
 * del mismo proceso. Durante esos segundos la app deja de responder y el
 * gateway devuelve **502 a quien pase por ahí**. En los 14 días de
 * `merch-crons.log` rotados a fecha 2026-08-25 hubo **8 días con un 502 a las
 * 04:00 UTC**, y en los ocho la víctima llegó **entre 3 y 11 s después** del
 * arranque de `makito-sync`. La víctima cambiaba de nombre —`webhook-retry`
 * unos días, `auto-proposal` otros—: no era un fallo de ningún endpoint, era
 * quien tuviera la mala suerte de caer dentro de la ventana.
 *
 * El 2026-08-05 ya se apartó a una víctima por esto (`refresh-tracking`, que pasó
 * del minuto 0 al 9 de su cadencia de 6 h). Apartar víctimas no escala: las tres de alta frecuencia
 * (cada 5 min y cada 15 min) **no pueden salirse del minuto en punto**. Por eso el
 * 2026-08-25 se apartó a los causantes, y este guard vigila que sigan
 * apartados.
 *
 * ⚠️ ALCANCE REAL — leer antes de confiar en él.
 *
 * Lo que SÍ garantiza: que nadie devuelva un sync a un minuto ya ocupado por
 * otro cron del catálogo, ni ponga un cron nuevo encima de un sync.
 *
 * Lo que NO puede garantizar:
 *   - que el catálogo coincida con el `crontab -l` del VPS (ese fichero no es
 *     accesible desde CI; para eso está `scripts/audit-crons-vps.sh`, que corre
 *     EN el VPS). Si alguien cambia el crontab y no el catálogo, esto pasa
 *     verde sobre una ficción;
 *   - que un minuto libre baste. Un sync que tarde más de 60 s en soltar el
 *     event loop volvería a arrollar al cron del minuto siguiente. Lo que se
 *     compra aquí es el margen que la evidencia dice que hace falta (la ventana
 *     medida fue de 3-11 s), no una garantía.
 *
 * Se deja escrito así de explícito porque un guard del que se cree más de lo
 * que hace es peor que no tenerlo.
 */
import { describe, it, expect } from "vitest";
import { CRON_CATALOG, type CronEntry } from "@/lib/cron-catalog";

/** Entradas que dispara el crontab del VPS (las de GitHub Actions van a su aire). */
const esDelVps = (e: CronEntry) => /local VPS|crontab del VPS/.test(e.schedule);

/** Un sync de catálogo de proveedor: son los pesados, los que bloquean. */
const esSync = (e: CronEntry) => e.name.endsWith("-sync");

/** Expande un campo cron (minuto u hora) a los valores en que dispara. */
export function expandirCampo(campo: string, max: number): number[] {
  const valores = new Set<number>();
  for (const parte of campo.split(",")) {
    const [rango, paso] = parte.split("/");
    const salto = paso ? Number(paso) : 1;
    let desde = 0;
    let hasta = max;
    if (rango !== "*") {
      const [a, b] = rango.split("-");
      desde = Number(a);
      hasta = b === undefined ? (paso ? max : Number(a)) : Number(b);
    }
    for (let v = desde; v <= hasta; v += salto) valores.add(v);
  }
  return [...valores].sort((x, y) => x - y);
}

/**
 * Instantes de reloj (minuto del día) en que dispara una expresión cron.
 * Los campos de día se ignoran A PROPÓSITO: dos crons con días distintos se
 * cuentan como coincidentes. Es la lectura conservadora — prefiere un aviso de
 * más a un 502 de más.
 */
export function instantesDelDia(scheduleCron: string): number[] {
  const campos = scheduleCron.trim().split(/\s+/);
  if (campos.length < 5) return [];
  const minutos = expandirCampo(campos[0], 59);
  const horas = expandirCampo(campos[1], 23);
  return horas.flatMap((h) => minutos.map((m) => h * 60 + m));
}

const hhmm = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

describe("guard: los syncs no comparten minuto con ningún otro cron del VPS", () => {
  const delVps = CRON_CATALOG.filter(esDelVps).filter(
    (e) => instantesDelDia(e.scheduleCron).length > 0,
  );
  const syncs = delVps.filter(esSync);

  it("cobertura: hay bastantes entradas para que este guard signifique algo", () => {
    // Sin esto, un catálogo vacío o un cambio de convención de nombres (que
    // dejaría `syncs` a cero) haría pasar la comprobación de abajo para
    // siempre. Es el modo de fallo silencioso de todo guard por descubrimiento.
    expect(delVps.length).toBeGreaterThanOrEqual(12);
    expect(syncs.length).toBeGreaterThanOrEqual(3);
  });

  it("cobertura: siguen existiendo los crons de alta frecuencia, que son las víctimas", () => {
    // Si desaparecieran, el guard seguiría verde sin vigilar nada relevante:
    // son ellos los que no pueden salirse del minuto en punto.
    const altaFrecuencia = delVps.filter((e) => instantesDelDia(e.scheduleCron).length >= 24);
    expect(altaFrecuencia.length).toBeGreaterThanOrEqual(3);
  });

  it("ningún sync coincide con otro cron", () => {
    const choques: string[] = [];
    for (const sync of syncs) {
      const suyos = new Set(instantesDelDia(sync.scheduleCron));
      for (const otro of delVps) {
        if (otro.name === sync.name) continue;
        const comunes = instantesDelDia(otro.scheduleCron).filter((t) => suyos.has(t));
        if (comunes.length > 0) {
          choques.push(`${sync.name} ↔ ${otro.name} en ${comunes.map(hhmm).join(", ")}`);
        }
      }
    }
    expect(choques).toEqual([]);
  });

  it("el detector detecta de verdad (si no, los tests de arriba no prueban nada)", () => {
    // Un guard cuyo comparador esté roto pasa verde sobre cualquier catálogo.
    expect(instantesDelDia("*/15 * * * *")).toContain(4 * 60);
    expect(instantesDelDia("0 4 * * *")).toEqual([4 * 60]);
    expect(instantesDelDia("2 6 * * *")).toEqual([6 * 60 + 2]);
    expect(expandirCampo("3-59/5", 59)[0]).toBe(3);
    // Y la colisión histórica que motivó todo esto: makito en el `0 6` contra
    // `webhook-retry`. Si esto dejara de dar choque, el guard sería un adorno.
    const antes = new Set(instantesDelDia("0 6 * * *"));
    expect(instantesDelDia("*/15 * * * *").some((t) => antes.has(t))).toBe(true);
  });
});
