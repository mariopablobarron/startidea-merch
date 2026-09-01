/**
 * Catálogo único de los crons del sistema. Punto de verdad para:
 *   - /admin/system/crons (UI)
 *   - /api/admin/crons (list)
 *   - /api/admin/crons/trigger/[name] (dispatch + log)
 *
 * Si añades un cron nuevo a /api/cron/*, regístralo aquí.
 */

/**
 * ⚠️ ZONA HORARIA — la confusión que este comentario existe para impedir.
 *
 * Los crons viven en DOS sitios con husos DISTINTOS:
 *   - **crontab del VPS** → hora **local del host, `Europe/Madrid`** (CEST = UTC+2
 *     en verano, CET = UTC+1 en invierno). Son la mayoría.
 *   - **GitHub Actions** (`.github/workflows/*.yml`) → **UTC** siempre.
 *
 * Hasta el 2026-08-11 este catálogo etiquetaba como "UTC" los del crontab, que
 * son locales: **todas las horas de los crons del VPS estaban 2 h desviadas**.
 * No es cosmético — se diagnostica con esto delante, y ya indujo al menos dos
 * conclusiones equivocadas al investigar syncs que no habían corrido.
 *
 * Regla: en `schedule`, escribir SIEMPRE de dónde sale la hora. Los del VPS como
 * `"diario 04:00 local VPS = 02:00 UTC"`; los de GitHub Actions, `"… UTC
 * (GitHub Actions)"`. `scheduleCron` copia LITERAL la expresión de su origen
 * (crontab o workflow), sin convertir a UTC: si no coincide carácter a carácter
 * con lo que dispara de verdad, este fichero miente.
 */
export type CronEntry = {
  name: string;
  endpointPath: string; // ej. "/api/cron/backup-db"
  method: "GET" | "POST";
  schedule: string; // cron expression en formato humano (con huso explícito)
  scheduleCron: string; // cron expression real, literal de su origen
  frequencyHours: number; // para clasificar STALE en cron-health
  description: string;
};

export const CRON_CATALOG: CronEntry[] = [
  {
    name: "midocean-sync",
    endpointPath: "/api/cron/midocean-sync",
    method: "POST",
    // Minuto 2 (mudanza del 2026-08-25): mismo motivo que makito-sync, ver su
    // entrada. Aquí no había daño medido todavía — es el mismo mecanismo con un
    // feed algo más ligero, y apartarlo cuesta lo mismo que esperar al primer
    // 502.
    schedule: "diario 04:02 local VPS = 02:02 UTC",
    scheduleCron: "2 4 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo MidOcean (productos + stock + printdata)",
  },
  {
    name: "midocean-print-pricelist-sync",
    endpointPath: "/api/cron/midocean-print-pricelist-sync",
    method: "POST",
    // Minuto 32 (mudanza del 2026-08-25): el :30 lo ocupan los tres crons de
    // alta frecuencia de merch. Ver la entrada de makito-sync.
    schedule: "diario 04:32 local VPS = 02:32 UTC",
    scheduleCron: "32 4 * * *",
    frequencyHours: 24,
    description: "Sync de tarifas (técnicas marcaje + precios producto)",
  },
  {
    name: "cifra-sync",
    endpointPath: "/api/cron/cifra-sync",
    method: "POST",
    // Minuto 33 y no 12 ni 0. Historia de dos mudanzas por la misma razón —
    // este cron cae en la hora más concurrida del VPS y el guard lo descarta
    // sin reintento:
    //   · 05:00 → 05:12 el 2026-08-05: en el minuto redondo se apilaban ~12
    //     watchdogs `*/5` y lo saltaba por carga (perdía 6 de cada 9 días).
    //   · 05:12 → 05:33 el 2026-08-21: `restic-offsite.sh` arranca a las 05:00
    //     y, con la cuota de Backblaze agotada, reintenta ~14,5 min antes de
    //     rendirse con rc=1 **reteniendo el lock de su slot**. Las 05:12 caen
    //     dentro, así que `cron-global-guard` lo descartaba con
    //     `skip=slot-busy` los días 19, 20 y 21 de agosto — y como no hay
    //     reintento, cada descarte pierde el día entero de catálogo. Era el
    //     único cron DIARIO atrapado en esa ventana (los demás son `*/5`,
    //     `*/10`, `*/15` y se recuperan solos en la pasada siguiente).
    // 05:33 deja 19 min de margen tras restic y esquiva tanto los minutos
    // múltiplos de 5 como el `1-59/5` del autodeploy del hub.
    schedule: "diario 05:33 local VPS = 03:33 UTC",
    scheduleCron: "33 5 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo Cifra (productos + variantes + pricelist)",
  },
  {
    name: "makito-sync",
    endpointPath: "/api/cron/makito-sync",
    method: "POST",
    // Minuto 2 (mudanza del 2026-08-25). Este sync es el más pesado del día
    // (~4.480 productos) y devuelve 202 en 0,1 s: el trabajo de verdad sigue
    // dentro del mismo proceso, que durante unos segundos deja de contestar y
    // el gateway responde 502 a quien pase por ahí. Mientras corría en el
    // minuto en punto arrollaba a los tres crons de merch que también caen en
    // el :00 — `auto-proposal` y `webhook-retry` (`*/15`) y
    // `send-scheduled-broadcasts` (`*/5`). Medido sobre los 14 días de
    // `merch-crons.log` rotado: 8 días con un 502, y en los 8 la víctima llegó
    // entre 3 y 11 s DESPUÉS del arranque de este sync; los días sanos son
    // aquellos en que nadie cayó dentro de esa ventana.
    // El 2026-08-05 ya se apartó a una víctima por el mismo motivo
    // (`refresh-tracking`, ver su entrada), pero apartar víctimas no escala:
    // las que corren `*/15` y `*/5` no pueden salirse del minuto en punto.
    // Se aparta al causante, que las cubre a todas. El :02 está libre de
    // cualquier otro cron de merch.
    schedule: "diario 06:02 local VPS = 04:02 UTC",
    scheduleCron: "2 6 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo Makito (XML productos/precios/stock + API tarifa marcaje)",
  },
  {
    name: "embeddings-sync",
    endpointPath: "/api/cron/embeddings-sync",
    method: "POST",
    // Sí tiene disparador: .github/workflows/embeddings-sync.yml → `0 5 * * *`.
    // El "—" anterior lo dejaba fuera de la vigilancia por silencio.
    schedule: "diario 05:00 UTC (GitHub Actions)",
    scheduleCron: "0 5 * * *",
    frequencyHours: 24,
    description: "Genera embeddings semánticos de productos (OpenAI)",
  },
  {
    name: "webhook-retry",
    endpointPath: "/api/cron/webhook-retry",
    method: "POST",
    schedule: "cada 15 min (crontab del VPS, hora local)",
    scheduleCron: "*/15 * * * *",
    frequencyHours: 0.25,
    description: "Reintenta webhook deliveries fallidos",
  },
  {
    name: "tariff-coverage-watchdog",
    endpointPath: "/api/cron/tariff-coverage-watchdog",
    method: "POST",
    schedule: "diario 07:30 local VPS = 05:30 UTC",
    scheduleCron: "30 7 * * *",
    frequencyHours: 24,
    description: "Vigila productos activos con técnica pero sin tarifa (cotización manual) y alerta si supera umbral",
  },
  {
    name: "auto-proposal",
    endpointPath: "/api/cron/auto-proposal",
    method: "POST",
    schedule: "cada 15 min (crontab del VPS, hora local)",
    scheduleCron: "*/15 * * * *",
    frequencyHours: 0.25,
    description: "Agente 24h: genera propuesta borrador + PDF por cada carrito nuevo y avisa al admin",
  },
  {
    name: "refresh-tracking",
    endpointPath: "/api/cron/refresh-tracking",
    method: "POST",
    // Minuto 45: segunda mudanza (2026-08-22). El minuto 9 esquivaba
    // makito-sync (mudanza del 2026-08-05, ver abajo) pero caía dentro de la
    // ventana en que el autodeploy de merch (`3-59/5`) está construyendo: los
    // dos comparten SLOT del cron-global-guard — el slot sale del hash del
    // comando, así que cambiar el minuto NO lo cambia — y un build de 5-6 min
    // retiene el lock del slot. El 2026-08-22 el watchdog delató que este cron
    // había perdido 2 de sus 4 disparos (06:09 y 12:09, `skip=slot-busy`),
    // justo los dos deploys de ese día. El :45 deja media hora de margen.
    // Mudanza previa (2026-08-05): del `0 */6` al `9 */6` para esquivar el
    // arranque de makito-sync, que dejaba la app sin responder y devolvía 502
    // (con cadencia de 6h, un 502 costaba 6 horas de retraso en el tracking
    // que ve el cliente).
    schedule: "cada 6h al minuto :45 (local VPS)",
    scheduleCron: "45 */6 * * *",
    frequencyHours: 6,
    description: "Refresca tracking de pedidos en producción",
  },
  {
    name: "improve-descriptions",
    endpointPath: "/api/cron/improve-descriptions",
    method: "POST",
    schedule: "diario (opcional, requiere OpenRouter)",
    scheduleCron: "—",
    frequencyHours: 24,
    description: "Mejora descripciones de productos con IA",
  },
  {
    name: "publish-scheduled",
    endpointPath: "/api/cron/publish-scheduled",
    method: "POST",
    // Verificado 2026-07-29: NO existe disparador — ni línea de crontab en el
    // VPS ni workflow en .github/workflows (la única mención de
    // "publish-scheduled" en el crontab es un comentario de otro proyecto), y
    // no hay ninguna key `cron_runs_publish-scheduled`, o sea que la ruta nunca
    // se ha ejecutado. El "cada 5 min" que ponía aquí era falso y hacía que el
    // watchdog lo diera por parado eternamente. Sin daño hoy: ContentPiece
    // está a 0 filas (nadie usa el Creator Studio en merch). Si se activa,
    // devolver aquí el `*/5 * * * *` junto con la línea de crontab real.
    schedule: "sin disparador (solo manual desde /admin/system/crons)",
    scheduleCron: "—",
    frequencyHours: 1,
    description: "Publica piezas de marketing programadas",
  },
  {
    name: "stock-alert",
    endpointPath: "/api/cron/stock-alert",
    method: "POST",
    schedule: "diario 09:00 local VPS = 07:00 UTC",
    scheduleCron: "0 9 * * *",
    frequencyHours: 24,
    description: "Alerta Telegram productos sin stock / críticos",
  },
  {
    name: "voice-agent-health",
    endpointPath: "/api/cron/voice-agent-health",
    method: "POST",
    schedule: "cada 6h al minuto :40 (local VPS)",
    scheduleCron: "40 */6 * * *",
    frequencyHours: 6,
    description: "Vigía de David (ElevenLabs): impago/cuota/fallos → alerta Telegram",
  },
  {
    name: "abandoned-cart-drip",
    endpointPath: "/api/cron/abandoned-cart-drip",
    method: "POST",
    // Minuto 37: movido el 2026-08-05 (perdía el 40% de sus corridas por
    // carga). Aquí seguía puesto el `30 5` viejo. Importa: este drip
    // selecciona por ventana deslizante, así que una noche saltada NO se
    // recupera — esos carritos se quedan sin email para siempre.
    schedule: "diario 05:37 local VPS = 03:37 UTC",
    scheduleCron: "37 5 * * *",
    frequencyHours: 24,
    description: "Drip D1/D3/D7 + auto-archivo D30 carritos abandonados",
  },
  {
    name: "review-invite",
    endpointPath: "/api/cron/review-invite",
    method: "POST",
    schedule: "diario 08:00 local VPS = 06:00 UTC",
    scheduleCron: "0 8 * * *",
    frequencyHours: 24,
    description: "Invitación a dejar review 7 días tras entrega",
  },
  {
    name: "backup-db",
    endpointPath: "/api/cron/backup-db",
    method: "POST",
    // Medido en el crontab 2026-08-11: `10 2 * * *` envuelto en
    // with-backup-lock. Ni la hora ni el minuto que ponía aquí ("03:00 UTC")
    // eran ciertos; el propio comentario del crontab también se quedó viejo.
    schedule: "diario 02:10 local VPS = 00:10 UTC (vía /root/backup-merch.sh)",
    scheduleCron: "10 2 * * *",
    frequencyHours: 24,
    description: "Backup completo Postgres (.sql.gz) — manejado por bash de root con retención 14d local + Telegram",
  },
  {
    name: "post-order-drip",
    endpointPath: "/api/cron/post-order-drip",
    method: "POST",
    // Minuto 7: movido el 2026-08-05 (en el minuto redondo se apilaban DIEZ
    // trabajos y perdía el 32% de sus corridas). Aquí seguía el `0 7` viejo.
    schedule: "diario 07:07 local VPS = 05:07 UTC",
    scheduleCron: "7 7 * * *",
    frequencyHours: 24,
    description: "Drip post-pedido D0/D14/D45 (gracias + informe + cupón)",
  },
  {
    name: "send-scheduled-broadcasts",
    endpointPath: "/api/cron/send-scheduled-broadcasts",
    method: "POST",
    schedule: "cada 5 min (crontab del VPS, hora local)",
    scheduleCron: "*/5 * * * *",
    frequencyHours: 1,
    description: "Envía los broadcasts programados (status SCHEDULED) cuya hora ha llegado",
  },
  {
    name: "quote-followup",
    endpointPath: "/api/cron/quote-followup",
    method: "POST",
    schedule: "diario 10:00 local VPS = 08:00 UTC",
    scheduleCron: "0 10 * * *",
    frequencyHours: 24,
    description: "Seguimiento de cotizaciones con enlace de pago enviado sin pagar (D2/D5/D10)",
  },
  {
    name: "proposal-followup",
    endpointPath: "/api/cron/proposal-followup",
    method: "POST",
    schedule: "diario 11:00 local VPS = 09:00 UTC",
    scheduleCron: "0 11 * * *",
    frequencyHours: 24,
    description: "Seguimiento de propuestas (PDF) enviadas sin responder (D3/D7)",
  },
  {
    name: "override-price-drift",
    endpointPath: "/api/cron/override-price-drift",
    method: "POST",
    // DISPARADOR IDENTIFICADO (2026-08-18): línea del `crontab -l` de root del
    // VPS, `0 9 * * 1 /usr/local/bin/merch-cron-runner.sh override-price-drift
    // POST /api/cron/override-price-drift`. No es un cron zombi de un servicio
    // externo, que era la sospecha (precedente: cron-job.org, mayo-2026).
    //
    // ⚠️ Por qué la búsqueda del 11-ago concluyó "no está en el crontab" con la
    // línea delante: el crontab de esta máquina es MIXTO. Casi todos los crons
    // de merch van envueltos en `cron-global-guard <base64>` — un `grep` normal
    // no los ve —, pero ESTE va en CLARO y suelto bajo el bloque de comentarios
    // de otro proyecto (Dify), sin cabecera propia. Un barrido que decodifica
    // base64 lo pierde, y uno que agrupa por bloque lo atribuye a Dify. Hay que
    // mirar las dos formas: eso es lo que hace `scripts/audit-crons-vps.sh`.
    // (El fichero no se toca desde el 10-ago 23:56, así que la línea YA estaba.)
    //
    // Corre a las 07:00 UTC, no a las 09:00: `0 9` es hora LOCAL del VPS.
    schedule: "semanal lunes 09:00 local VPS = 07:00 UTC (crontab de root del VPS)",
    scheduleCron: "0 9 * * 1",
    frequencyHours: 168,
    description:
      "Watchdog de overrides de precio desfasados: avisa si el neto del proveedor subio y el PVP fijado quedo con margen <30% (o bajo coste)",
  },
  // ── Crons disparados por GitHub Actions (UTC), añadidos el 2026-09-01 ──────
  //
  // Los nueve de abajo llevaban tiempo corriendo SIN estar en este catálogo.
  // No estaban desatendidos —`listCronNames()` los recoge en cuanto han pasado
  // una vez por `wrapCronHandler`, y `silenceWatchability()` trata como
  // vigilable lo que no conoce—, pero sí les faltaba lo que este fichero da:
  // salir en /admin/system/crons y, sobre todo, poder **relanzarse a mano**
  // desde /api/admin/crons/trigger/[name], que responde 404 a lo que no está
  // aquí.
  //
  // El día que lo demostró: el 2026-09-01 el disparo de `metric-snapshot`
  // falló (tres intentos, la petición no llegó a salir del runner de GitHub) y
  // la fila de ese día se perdió para siempre — el snapshot NO se puede
  // reconstruir a posteriori, porque `views30d`/`cartAdds30d` salen de
  // contadores rodantes que el rollup resetea. Con la entrada puesta, ese
  // agujero se cierra con un clic el mismo día en vez de quedarse abierto.
  //
  // `frequencyHours` NO cambia el aviso por silencio: `expectedHoursFor()` da
  // prioridad a `EXPECTED_HOURS_OVERRIDE` en cron-staleness.ts, que ya cubre a
  // siete de estos nueve. Se deja así a propósito: añadir catálogo no debe
  // mover ningún umbral de alerta.
  {
    name: "metric-snapshot",
    endpointPath: "/api/cron/metric-snapshot",
    method: "POST",
    // Mudado de GitHub Actions al crontab del VPS el 2026-09-01. Lee los
    // contadores rodantes que deja `product-view-rollup`, así que tiene que
    // correr DESPUÉS que él: van a 06:40 y 06:50 para que el orden esté
    // garantizado por el disparador y no por la suerte. El porqué de la
    // mudanza, en la entrada de `product-view-rollup`.
    schedule: "diario 06:50 local VPS = 04:50 UTC",
    scheduleCron: "50 6 * * *",
    frequencyHours: 24,
    description:
      "Guarda el snapshot diario de KPIs en MetricSnapshot (grafica historica) y purga los de mas de 180 dias",
  },
  {
    name: "product-view-rollup",
    endpointPath: "/api/cron/product-view-rollup",
    method: "POST",
    // Mudado de GitHub Actions al crontab del VPS el 2026-09-01. Medido ese
    // día: desde la caída de Actions del 26-ago GitHub entrega los `schedule`
    // con 5-12 h de retraso y no ha vuelto (su estado dice `operational`).
    // Este par declaraba 03:30 y 03:35 UTC —5 min de colchón para que el
    // rollup corriera antes que el snapshot— y acabó disparándose los dos en
    // el mismo minuto. 06:40 deja además ~23 min tras el final de makito-sync
    // (06:02 + ~15 min), que es lo que pedía el "después de los syncs".
    schedule: "diario 06:40 local VPS = 04:40 UTC",
    scheduleCron: "40 6 * * *",
    frequencyHours: 24,
    description:
      "Mantenimiento diario de ProductView: recalcula las ventanas rodantes de 30 dias antes del snapshot",
  },
  {
    name: "makito-marking-enrich",
    endpointPath: "/api/cron/makito-marking-enrich",
    method: "POST",
    schedule: "diario 02:15 UTC (GitHub Actions)",
    scheduleCron: "15 2 * * *",
    frequencyHours: 24,
    description:
      "Sustituye las posiciones de marcaje virtuales por las reales del API del proveedor",
  },
  {
    name: "auto-resolve-errors",
    endpointPath: "/api/cron/auto-resolve-errors",
    method: "POST",
    schedule: "diario 04:15 UTC (GitHub Actions)",
    scheduleCron: "15 4 * * *",
    frequencyHours: 24,
    description:
      "Marca como resueltos los ErrorEvent con >=30 dias sin ocurrencias nuevas de la misma firma",
  },
  {
    name: "ai-usage-alert",
    endpointPath: "/api/cron/ai-usage-alert",
    method: "POST",
    schedule: "diario 10:00 UTC (GitHub Actions)",
    scheduleCron: "0 10 * * *",
    frequencyHours: 24,
    description:
      "Computa el coste de IA del dia anterior y avisa al admin si supera el umbral",
  },
  {
    name: "cron-watchdog",
    endpointPath: "/api/cron/cron-watchdog",
    method: "POST",
    schedule: "diario 11:00 UTC (GitHub Actions)",
    scheduleCron: "0 11 * * *",
    frequencyHours: 24,
    description:
      "Vigila que ningun cron lleve mas de lo esperado sin correr. Se excluye de su propio recorrido: su salud la mira evaluateWatchdogSelfRun",
  },
  {
    name: "insights-digest",
    endpointPath: "/api/cron/insights-digest",
    method: "POST",
    schedule: "semanal lunes 08:00 UTC (GitHub Actions)",
    scheduleCron: "0 8 * * 1",
    frequencyHours: 168,
    description: "Email semanal al admin con el resumen de /admin/insights",
  },
  {
    name: "insights-digest-monthly",
    endpointPath: "/api/cron/insights-digest-monthly",
    method: "POST",
    schedule: "mensual dia 1 a las 09:00 UTC (GitHub Actions)",
    scheduleCron: "0 9 1 * *",
    frequencyHours: 720,
    description:
      "Email mensual al admin comparando los KPIs del mes cerrado con el anterior",
  },
  {
    name: "competitor-watch",
    endpointPath: "/api/cron/competitor-watch",
    method: "POST",
    schedule: "semanal lunes 06:00 UTC (GitHub Actions)",
    scheduleCron: "0 6 * * 1",
    frequencyHours: 168,
    description:
      "Compara PVP y marcaje con los de la competencia y propone subir o bajar respetando el suelo de coste",
  },
];

export function findCron(name: string): CronEntry | null {
  return CRON_CATALOG.find((c) => c.name === name) || null;
}
