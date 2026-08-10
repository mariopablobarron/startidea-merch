/**
 * Guard: toda hora del catálogo de crons dice de qué huso es.
 *
 * Los crons de este proyecto viven en dos sitios con husos DISTINTOS: el
 * crontab del VPS (hora local, `Europe/Madrid`) y GitHub Actions (UTC). Hasta
 * el 2026-08-11 el catálogo etiquetaba "UTC" a los del crontab, que son
 * locales, y **once entradas estaban 2 h desviadas**.
 *
 * No fue cosmético. Se diagnostica con este fichero delante, y la desviación ya
 * indujo dos conclusiones equivocadas al investigar por qué unos syncs no
 * habían corrido — incluida una "corrección" en el propio backlog que repetía
 * el error. Una hora sin huso no es media verdad: es una trampa, porque se lee
 * como si lo tuviera.
 *
 * ⚠️ ALCANCE REAL DE ESTE GUARD — leer antes de confiar en él.
 *
 * Se escribió creyendo que habría cazado el fallo de 2026-08-11, y **no lo
 * habría cazado**: se comprobó restaurando el catálogo viejo y solo saltó por
 * UNA entrada de once. El motivo importa — aquel catálogo *sí* declaraba huso;
 * declaraba el **equivocado**. Un guard que exige "di de qué huso es" pasa
 * verde ante una etiqueta falsa, y el test de coherencia de minutos tampoco lo
 * ve, porque texto y cron estaban mal **de forma coherente entre sí**.
 *
 * Lo que este guard SÍ garantiza:
 *   - que no vuelva a escribirse una hora sin huso ninguno (el caso de
 *     `override-price-drift`, que era ambiguo de verdad);
 *   - que el texto humano y la expresión cron no se contradigan dentro del
 *     fichero (el minuto del uno contra el del otro);
 *   - que una entrada con workflow copie el cron literal de su `.yml`.
 *
 * Lo que NO puede garantizar: que la hora coincida con el crontab del VPS. Ese
 * fichero no es accesible desde CI. La única comprobación que cerraría el hueco
 * de verdad es un script que corra EN el VPS comparando catálogo contra
 * `crontab -l`; queda propuesto, no hecho.
 *
 * Se deja escrito así de explícito porque un guard del que se cree más de lo
 * que hace es peor que no tenerlo: nadie vuelve a mirar lo que él ya "vigila".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CRON_CATALOG } from "@/lib/cron-catalog";

/** Una hora de reloj: "04:00", "05:12". */
const HORA_DE_RELOJ = /\d{1,2}:\d{2}/;

/** Declaración de huso aceptada. */
const DECLARA_HUSO = /local VPS|UTC/;

describe("guard: el catálogo de crons declara el huso de cada hora", () => {
  it("cobertura: el catálogo tiene entradas suficientes para que este guard signifique algo", () => {
    // Sin esto, un catálogo vacío (o un import que se rompe y devuelve []) haría
    // pasar todas las pruebas de abajo para siempre. Es el modo de fallo
    // silencioso de todo guard estático, y los cinco guards hermanos del repo
    // llevan su propia comprobación de cobertura por esta misma razón.
    expect(CRON_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it("toda entrada con hora de reloj declara si es local del VPS o UTC", () => {
    const ambiguas = CRON_CATALOG.filter(
      (c) => HORA_DE_RELOJ.test(c.schedule) && !DECLARA_HUSO.test(c.schedule),
    ).map((c) => `${c.name}: "${c.schedule}"`);

    expect(ambiguas).toEqual([]);
  });

  it("toda entrada con hora FIJA en su cron dice a qué hora es, y de qué huso", () => {
    // El complemento del test anterior. Aquel caza "04:00" sin huso; este caza
    // lo contrario — un cron que dispara a una hora concreta pero cuyo texto no
    // menciona ninguna ("diario", a secas). Sin los dos, basta con quitar la
    // hora del texto para que el fichero vuelva a no decir nada.
    const conHoraFija = CRON_CATALOG.filter((c) => {
      const partes = c.scheduleCron.trim().split(/\s+/);
      if (partes.length !== 5) return false; // "—" y demás: sin disparador
      const hora = partes[1];
      return /^\d+$/.test(hora); // hora fija (no "*" ni "*/N")
    });

    // Que el filtro encuentre entradas es parte de lo que se comprueba: si un
    // cambio de formato lo dejara a cero, el `every` de abajo pasaría vacío.
    expect(conHoraFija.length).toBeGreaterThanOrEqual(10);

    const mudas = conHoraFija
      .filter((c) => !(HORA_DE_RELOJ.test(c.schedule) && DECLARA_HUSO.test(c.schedule)))
      .map((c) => `${c.name}: "${c.schedule}" (cron ${c.scheduleCron})`);

    expect(mudas).toEqual([]);
  });

  it("los minutos del texto y los del cron no se contradicen", () => {
    // El desfase de husos vino acompañado de minutos obsoletos: cuatro crons se
    // movieron de minuto el 2026-08-05 (para esquivar los minutos redondos, en
    // los que se apilan ~12 watchdogs y el guard los salta por carga) y el
    // catálogo se quedó con los viejos. `cifra-sync` decía 05:00 disparando a
    // las 05:12, y `post-order-drip` 07:00 disparando a las 07:07.
    const incoherentes: string[] = [];

    for (const c of CRON_CATALOG) {
      const partes = c.scheduleCron.trim().split(/\s+/);
      if (partes.length !== 5) continue;
      const minutoCron = partes[0];
      if (!/^\d+$/.test(minutoCron)) continue; // "*/5" y demás: sin minuto único

      const m = /(\d{1,2}):(\d{2})/.exec(c.schedule);
      if (!m) continue; // ya lo cazan los tests de arriba

      if (Number(m[2]) !== Number(minutoCron)) {
        incoherentes.push(
          `${c.name}: el texto dice :${m[2]} pero el cron dispara al minuto ${minutoCron}`,
        );
      }
    }

    expect(incoherentes).toEqual([]);
  });

  it("una entrada con workflow copia el cron LITERAL de su .yml", () => {
    // Lo único de este fichero contrastable contra su origen REAL desde CI. Los
    // crons del VPS no lo son: su crontab no está en el repo. Aquí, si alguien
    // cambia la hora en el workflow y se olvida del catálogo, el panel
    // /admin/system/crons pasa a mentir y el umbral de silencio se calcula
    // sobre una frecuencia que ya no es la que dispara.
    const dir = join(process.cwd(), ".github", "workflows");
    const comprobadas: string[] = [];
    const desalineadas: string[] = [];

    for (const c of CRON_CATALOG) {
      const yml = join(dir, `${c.name}.yml`);
      if (!existsSync(yml)) continue;
      const m = /cron:\s*['"]([^'"]+)['"]/.exec(readFileSync(yml, "utf8"));
      if (!m) continue; // workflow solo con workflow_dispatch: nada que comparar
      comprobadas.push(c.name);
      if (m[1].trim() !== c.scheduleCron.trim()) {
        desalineadas.push(`${c.name}: catálogo "${c.scheduleCron}" vs workflow "${m[1]}"`);
      }
    }

    // Cobertura: si el barrido deja de encontrar workflows programados —por un
    // cambio de rutas o de nombres— este test pasaría verde sin comparar nada.
    expect(comprobadas.length).toBeGreaterThanOrEqual(1);
    expect(desalineadas).toEqual([]);
  });
});
