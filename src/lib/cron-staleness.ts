import { findCron } from "@/lib/cron-catalog";

/**
 * Umbral de silencio de los crons para el watchdog (`/api/cron/cron-watchdog`).
 *
 * Fuente de verdad = `CRON_CATALOG.frequencyHours` × margen. Antes el watchdog
 * tenía un mapa hardcodeado aparte y todo lo no listado caía a 30h, con dos
 * fallos:
 *   - un cron del catálogo con frecuencia > 30h (p.ej. `override-price-drift`,
 *     semanal = 168h) se marcaba como parado EN FALSO durante ~5 días de cada
 *     semana;
 *   - un cron de alta frecuencia (webhook-retry, cada 15 min) tardaba 30h en
 *     detectarse muerto.
 *
 * Los overrides quedan solo para crons que NO viven en CRON_CATALOG (los de
 * GitHub Actions: se trackean vía wrapCronHandler pero no están en el catálogo).
 * Cada valor va contrastado contra el `schedule:` REAL de su workflow en
 * `.github/workflows/` — un umbral inventado produce falsas alarmas eternas
 * (ver el caso de `metric-snapshot` más abajo).
 */
export const EXPECTED_HOURS_OVERRIDE: Record<string, number> = {
  // metric-snapshot.yml → `35 3 * * *` = DIARIO (el comentario anterior decía
  // "cada hora" y ponía 2h: un cron diario quedaba marcado como parado ~22h de
  // cada 24, o sea casi siempre. Era el mayor generador de ruido del watchdog).
  "metric-snapshot": 30, // metric-snapshot.yml → `35 3 * * *` diario
  "ai-usage-alert": 30, // ai-usage-alert.yml → `0 10 * * *` diario
  "auto-resolve-errors": 30, // auto-resolve-errors.yml → `15 4 * * *` diario
  "product-view-rollup": 30, // product-view-rollup.yml → `30 3 * * *` diario
  "insights-digest": 8 * 24, // insights-digest.yml → `0 8 * * 1` semanal
  "insights-digest-monthly": 35 * 24, // insights-digest-monthly.yml → `0 9 1 * *` mensual
  // competitor-watch.yml → `0 6 * * 1` SEMANAL. Sin esta entrada caía a
  // DEFAULT_HOURS (30h) y salía "parado" de martes a domingo: la misma falsa
  // alarma que metric-snapshot, en la dirección contraria. El guard
  // cron-staleness-vs-workflows.guard.test.ts impide que vuelva a colarse.
  "competitor-watch": 8 * 24,
};

/**
 * Frecuencia aproximada, en horas, de una expresión cron de 5 campos.
 *
 * No pretende ser un parser completo: solo distinguir los órdenes de magnitud
 * que necesita el watchdog (horaria / cada N horas / diaria / semanal /
 * mensual) para comprobar que su umbral de silencio es coherente con lo que
 * dispara el cron de verdad. Ante una expresión que no entiende, devuelve
 * `null` en vez de inventarse un número — que es exactamente cómo nacieron las
 * falsas alarmas que este módulo arrastra.
 */
export function estimateFrequencyHours(expr: string): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [, hour, dom, , dow] = parts;

  if (dom !== "*") return 30 * 24; // día fijo del mes → mensual
  if (dow !== "*") return 7 * 24; // día fijo de la semana → semanal

  if (hour === "*") return 1;
  const everyN = /^\*\/(\d+)$/.exec(hour);
  if (everyN) {
    const n = Number(everyN[1]);
    return n > 0 && n <= 24 ? n : null;
  }
  if (/^\d+$/.test(hour)) return 24; // hora fija, todos los días
  return null;
}

/**
 * Crons cuya ejecución real NO pasa por una llamada HTTP a su ruta: el silencio
 * de `cron_runs_*` es lo ESPERADO, no una avería. Vigilarlos por silencio
 * genera una falsa alarma permanente que no se puede resolver.
 */
export const NOT_HTTP_TRIGGERED: Record<string, string> = {
  // El crontab del VPS lo dice explícitamente: "El backup-db NO está aquí —
  // /root/backup-merch.sh hace backup local+TG a 03:00". La ruta HTTP existe
  // para disparo manual desde el panel, pero nadie la llama de forma periódica.
  "backup-db": "lo ejecuta /root/backup-merch.sh en el host, no la ruta HTTP",
};

export const DEFAULT_HOURS = 30;

/** Nombre del propio watchdog, para poder auto-vigilarse sin cadenas sueltas. */
export const WATCHDOG_NAME = "cron-watchdog";

// Un cron puede retrasarse (jitter de cron/GH Actions, carga del VPS) sin estar
// muerto. 2× su frecuencia declarada da holgura sin dejar pasar demasiado
// tiempo uno realmente parado.
export const STALE_MARGIN = 2;

/**
 * Holgura mínima ABSOLUTA, en horas, por encima de la frecuencia declarada.
 *
 * Un cron puede retrasarse sin estar muerto: jitter del planificador de GitHub
 * Actions (que en agosto de 2026 llegó a disparar 3 de 24 pings horarios),
 * carga del VPS, un deploy a mitad. Por debajo de esta holgura, el umbral
 * produce falsas alarmas — y cada falsa alarma empuja un problema real fuera
 * de los 280 caracteres del aviso de Telegram.
 */
export const MIN_JITTER_SLACK_HOURS = 6;

/**
 * Ventana de umbrales de silencio admisibles para un cron de frecuencia dada.
 *
 * Vive aquí, y no dentro del guard que la usa, por dos razones: es la regla que
 * decide qué umbrales son legítimos (o sea, parte de la vigilancia, no de su
 * test), y así se puede comprobar la propiedad que le faltaba — **que la
 * ventana nunca esté vacía**.
 *
 * Porque lo estaba. El techo era `freq × 4` a secas, y con el suelo en
 * `freq + max(6, freq × 0,1)` eso da una ventana IMPOSIBLE en cuanto
 * `freq < 2`: para un cron horario pedía un umbral «entre 7h y 4h». Nadie lo
 * había visto porque hoy ningún workflow con `cron-trigger` es horario — es
 * una trampa latente que salta el día que alguien intenta vigilar uno
 * (justo lo que hacía falta para `health-ping`, que corre cada hora).
 *
 * El techo pasa a ser `max(freq × 4, min × 1,5)`: para frecuencias medias y
 * largas manda `freq × 4` igual que antes (nada cambia para los 14 workflows
 * actuales), y para las cortas el suelo arrastra al techo consigo, dejando
 * siempre un margen real donde elegir.
 */
export function thresholdWindowFor(frequencyHours: number): { min: number; max: number } {
  const min = frequencyHours + Math.max(MIN_JITTER_SLACK_HOURS, frequencyHours * 0.1);
  // Un umbral demasiado laxo tarda semanas en detectar un cron muerto, pero un
  // techo por debajo del suelo no deja elegir NINGUNO: el suelo manda.
  const max = Math.max(frequencyHours * 4, min * 1.5);
  return { min, max };
}

/**
 * Crons cuyo silencio cuesta DINERO o toca al cliente, y que por tanto van
 * primero en el aviso: el cuerpo del push se trunca a 280 caracteres, así que
 * el orden decide qué llega a verse. Los tres syncs de proveedor congelan
 * catálogo, stock y **precio de coste** (con lo que el PVP deja de reflejar la
 * realidad); los guards vigilan márgenes; webhook-retry reintenta los webhooks
 * de pago de Stripe.
 */
export const CRITICAL_CRONS = new Set([
  "midocean-sync",
  "midocean-print-pricelist-sync",
  "cifra-sync",
  "makito-sync",
  "override-price-drift",
  "tariff-coverage-watchdog",
  "webhook-retry",
]);

/** Horas de silencio a partir de las cuales un cron se considera "parado". */
export function expectedHoursFor(name: string): number {
  const override = EXPECTED_HOURS_OVERRIDE[name];
  if (override != null) return override;
  const cat = findCron(name);
  if (cat && cat.frequencyHours > 0) return cat.frequencyHours * STALE_MARGIN;
  return DEFAULT_HOURS;
}

/**
 * ¿Ha tardado el propio watchdog más de la cuenta en volver a ejecutarse?
 *
 * El watchdog se excluía de su propio recorrido ("no notificarnos a nosotros
 * mismos"), y eso dejaba un punto ciego real: **si su disparador falla, nadie
 * avisa de nada**. Pasó el 2026-08-27 — el planificador de GitHub Actions se
 * retrasó ~11 h para este repo, el run diario de las 11:00 UTC no salió, y ese
 * mismo día había un sync de makito colgado 12 h que el watchdog SÍ detecta
 * cuando corre. El aviso solo existió porque el agente lo disparó a mano.
 *
 * No puede avisar mientras está caído — pero **en cuanto vuelve** sabe cuánto
 * tiempo estuvo sin correr, y eso es justo el dato que faltaba. Es un aviso
 * retrospectivo, y aun así llega antes que nadie mirando a mano.
 *
 * `lastRunAt` es la ejecución ANTERIOR, no la actual: `wrapCronHandler`
 * registra en su `finally`, o sea después de que este handler devuelva. Si
 * algún día se adelantara ese registro, esto mediría siempre 0 y volvería a
 * quedarse ciego en silencio.
 */
export function evaluateWatchdogSelfRun(
  lastRunAt: string | null,
  nowMs: number,
): { silent: boolean; hoursSinceLastRun: number | null; expectedHours: number } {
  const expectedHours = expectedHoursFor(WATCHDOG_NAME);
  if (!lastRunAt) {
    // Sin historia previa no se puede concluir nada: puede ser la primera
    // ejecución tras un despliegue. Callar es el lado seguro (una falsa alarma
    // aquí desacreditaría justo el aviso que este chequeo existe para dar).
    return { silent: false, hoursSinceLastRun: null, expectedHours };
  }
  const ms = new Date(lastRunAt).getTime();
  if (!Number.isFinite(ms)) {
    return { silent: false, hoursSinceLastRun: null, expectedHours };
  }
  const hours = (nowMs - ms) / 3_600_000;
  return {
    silent: hours > expectedHours,
    hoursSinceLastRun: Math.round(hours * 10) / 10,
    expectedHours,
  };
}

export type SilenceWatchability =
  | { watchable: true }
  | { watchable: false; reason: string };

/**
 * ¿Tiene sentido avisar de que este cron lleva tiempo sin ejecutarse?
 *
 * Solo si algo lo dispara de verdad. Un cron sin disparador (`scheduleCron: "—"`
 * en el catálogo) o disparado fuera de la ruta HTTP nunca dejará de estar
 * "silencioso", así que avisar de él es ruido permanente — y el ruido es lo que
 * hizo que un problema REAL (cifra-sync parado casi 3 días, con los precios de
 * 2.513 productos congelados) pasara desapercibido entre 6 falsas alarmas.
 *
 * Ojo: "no vigilable por silencio" NO significa "no importa". Sigue apareciendo
 * en el panel /admin/system/crons y un fallo suyo al ejecutarse sí se avisa.
 */
export function silenceWatchability(name: string): SilenceWatchability {
  const notHttp = NOT_HTTP_TRIGGERED[name];
  if (notHttp) return { watchable: false, reason: notHttp };
  const cat = findCron(name);
  // `typeof` y no solo `cat &&`: una entrada de catálogo incompleta (o un test
  // que lo mockea a medias) no debe tumbar el watchdog entero. Sin dato, se
  // vigila — que es el lado seguro: preferimos un aviso de más a dejar de mirar
  // un cron por un campo que falta.
  if (cat && typeof cat.scheduleCron === "string" && cat.scheduleCron.trim() === "—") {
    return { watchable: false, reason: "no tiene disparador programado" };
  }
  // Fuera del catálogo (crons de GitHub Actions) se vigilan igual: los trackea
  // wrapCronHandler y su umbral sale de EXPECTED_HOURS_OVERRIDE / DEFAULT_HOURS.
  return { watchable: true };
}

/** Los críticos primero; dentro de cada grupo, orden alfabético estable. */
export function sortBySeverity(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ca = CRITICAL_CRONS.has(a) ? 0 : 1;
    const cb = CRITICAL_CRONS.has(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return a.localeCompare(b);
  });
}

/**
 * Cada cuánto se recuerda un problema que SIGUE ahí.
 *
 * El anti-spam original solo comparaba conjuntos: mientras la lista de crons con
 * problemas no cambiara, no se volvía a avisar NUNCA. Con `cifra-sync` parado
 * desde el 26-jul eso significó un único aviso, perdido entre 6 falsas alarmas,
 * y después silencio mientras los precios de un proveedor entero seguían
 * congelados.
 *
 * 72h es el punto medio entre recordar y molestar: el watchdog corre a diario,
 * así que un problema persistente se recuerda cada 3 días en vez de cada día.
 * Es la misma lógica por la que `override-price-drift` repite su aviso semanal
 * mientras el problema siga vivo: callarse ante un problema de dinero que no se
 * ha resuelto es peor que repetirse.
 */
export const REALERT_AFTER_HOURS = 72;

export type WatchdogAlertDecision = {
  notify: boolean;
  reason: "sin-issues" | "lista-nueva" | "persistente" | "ya-avisado";
};

/**
 * Decide si el watchdog debe avisar. Pura para poder testearla: la ruta solo
 * lee estado, llama a esto y notifica.
 *
 * - Lista distinta a la última avisada → avisa (hay algo nuevo).
 * - Lista igual pero ≥ REALERT_AFTER_HOURS desde el último aviso → recuerda.
 * - Lista igual y reciente → calla.
 *
 * `lastAlertAt: null` (estado en formato antiguo, sin fecha) cuenta como "hace
 * mucho": preferimos un recordatorio de más al desplegar que seguir mudos ante
 * un problema que ya llevaba días abierto.
 */
export function decideWatchdogAlert(input: {
  currentNames: string[];
  lastNames: string[];
  lastAlertAt: string | null;
  nowMs: number;
}): WatchdogAlertDecision {
  const { currentNames, lastNames, lastAlertAt, nowMs } = input;
  if (currentNames.length === 0) return { notify: false, reason: "sin-issues" };

  const current = new Set(currentNames);
  const last = new Set(lastNames);
  const sameAsBefore =
    current.size === last.size && [...current].every((n) => last.has(n));
  if (!sameAsBefore) return { notify: true, reason: "lista-nueva" };

  const lastMs = lastAlertAt ? Date.parse(lastAlertAt) : NaN;
  if (!Number.isFinite(lastMs)) return { notify: true, reason: "persistente" };
  const hours = (nowMs - lastMs) / 3_600_000;
  if (hours >= REALERT_AFTER_HOURS) return { notify: true, reason: "persistente" };
  return { notify: false, reason: "ya-avisado" };
}

/** Estado persistido en AdminSetting `cron_watchdog_last_alert`. */
export type WatchdogAlertState = { names: string[]; at: string | null };

/**
 * Lee el estado tolerando el formato ANTIGUO (array plano de nombres, sin
 * fecha), que es lo que hay hoy en producción. Sin esto, el primer run tras el
 * deploy perdería la memoria de lo ya avisado y alertaría de todo otra vez.
 */
export function parseWatchdogAlertState(value: unknown): WatchdogAlertState {
  if (Array.isArray(value)) {
    return { names: value.filter((v): v is string => typeof v === "string"), at: null };
  }
  if (value && typeof value === "object") {
    const obj = value as { names?: unknown; at?: unknown };
    if (Array.isArray(obj.names)) {
      return {
        names: obj.names.filter((v): v is string => typeof v === "string"),
        at: typeof obj.at === "string" ? obj.at : null,
      };
    }
  }
  return { names: [], at: null };
}
