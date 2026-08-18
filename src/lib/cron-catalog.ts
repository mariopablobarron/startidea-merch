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
    schedule: "diario 04:00 local VPS = 02:00 UTC",
    scheduleCron: "0 4 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo MidOcean (productos + stock + printdata)",
  },
  {
    name: "midocean-print-pricelist-sync",
    endpointPath: "/api/cron/midocean-print-pricelist-sync",
    method: "POST",
    schedule: "diario 04:30 local VPS = 02:30 UTC",
    scheduleCron: "30 4 * * *",
    frequencyHours: 24,
    description: "Sync de tarifas (técnicas marcaje + precios producto)",
  },
  {
    name: "cifra-sync",
    endpointPath: "/api/cron/cifra-sync",
    method: "POST",
    // Minuto 12 y no 0: movido el 2026-08-05 porque en el minuto redondo se
    // apilaban ~12 watchdogs `*/5` y el guard lo saltaba por carga (perdía 6 de
    // cada 9 días). Aquí seguía puesto el `0 5` viejo.
    schedule: "diario 05:12 local VPS = 03:12 UTC",
    scheduleCron: "12 5 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo Cifra (productos + variantes + pricelist)",
  },
  {
    name: "makito-sync",
    endpointPath: "/api/cron/makito-sync",
    method: "POST",
    schedule: "diario 06:00 local VPS = 04:00 UTC",
    scheduleCron: "0 6 * * *",
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
    schedule: "cada 15 min",
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
    schedule: "cada 15 min",
    scheduleCron: "*/15 * * * *",
    frequencyHours: 0.25,
    description: "Agente 24h: genera propuesta borrador + PDF por cada carrito nuevo y avisa al admin",
  },
  {
    name: "refresh-tracking",
    endpointPath: "/api/cron/refresh-tracking",
    method: "POST",
    // Minuto 9: movido el 2026-08-05 para esquivar el minuto en que arranca
    // makito-sync, que dejaba la app sin responder y le devolvía 502 (y con
    // cada 6h de cadencia, un 502 costaba 6 horas de retraso en el tracking
    // que ve el cliente). Aquí seguía puesto el `0 */6` viejo.
    schedule: "cada 6h al minuto :09 (local VPS)",
    scheduleCron: "9 */6 * * *",
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
    schedule: "cada 5 min",
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
];

export function findCron(name: string): CronEntry | null {
  return CRON_CATALOG.find((c) => c.name === name) || null;
}
