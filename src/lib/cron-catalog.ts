/**
 * Catálogo único de los crons del sistema. Punto de verdad para:
 *   - /admin/system/crons (UI)
 *   - /api/admin/crons (list)
 *   - /api/admin/crons/trigger/[name] (dispatch + log)
 *
 * Si añades un cron nuevo a /api/cron/*, regístralo aquí.
 */

export type CronEntry = {
  name: string;
  endpointPath: string; // ej. "/api/cron/backup-db"
  method: "GET" | "POST";
  schedule: string; // cron expression en formato humano
  scheduleCron: string; // cron expression real
  frequencyHours: number; // para clasificar STALE en cron-health
  description: string;
};

export const CRON_CATALOG: CronEntry[] = [
  {
    name: "midocean-sync",
    endpointPath: "/api/cron/midocean-sync",
    method: "POST",
    schedule: "diario 04:00 UTC",
    scheduleCron: "0 4 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo MidOcean (productos + stock + printdata)",
  },
  {
    name: "midocean-print-pricelist-sync",
    endpointPath: "/api/cron/midocean-print-pricelist-sync",
    method: "POST",
    schedule: "diario 04:30 UTC",
    scheduleCron: "30 4 * * *",
    frequencyHours: 24,
    description: "Sync de tarifas (técnicas marcaje + precios producto)",
  },
  {
    name: "cifra-sync",
    endpointPath: "/api/cron/cifra-sync",
    method: "POST",
    schedule: "diario 05:00 UTC",
    scheduleCron: "0 5 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo Cifra (productos + variantes + pricelist)",
  },
  {
    name: "makito-sync",
    endpointPath: "/api/cron/makito-sync",
    method: "POST",
    schedule: "diario 06:00 UTC",
    scheduleCron: "0 6 * * *",
    frequencyHours: 24,
    description: "Sincroniza catálogo Makito (XML productos/precios/stock + API tarifa marcaje)",
  },
  {
    name: "embeddings-sync",
    endpointPath: "/api/cron/embeddings-sync",
    method: "POST",
    schedule: "diario",
    scheduleCron: "—",
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
    schedule: "cada 6h",
    scheduleCron: "0 */6 * * *",
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
    schedule: "cada 5 min",
    scheduleCron: "*/5 * * * *",
    frequencyHours: 1,
    description: "Publica piezas de marketing programadas",
  },
  {
    name: "stock-alert",
    endpointPath: "/api/cron/stock-alert",
    method: "POST",
    schedule: "diario 09:00 UTC",
    scheduleCron: "0 9 * * *",
    frequencyHours: 24,
    description: "Alerta Telegram productos sin stock / críticos",
  },
  {
    name: "abandoned-cart-drip",
    endpointPath: "/api/cron/abandoned-cart-drip",
    method: "POST",
    schedule: "diario 05:30 UTC",
    scheduleCron: "30 5 * * *",
    frequencyHours: 24,
    description: "Drip D1/D3/D7 + auto-archivo D30 carritos abandonados",
  },
  {
    name: "abandoned-reminders",
    endpointPath: "/api/cron/abandoned-reminders",
    method: "POST",
    schedule: "cada 12h (00:00 y 12:00 UTC)",
    scheduleCron: "0 0,12 * * *",
    frequencyHours: 12,
    description: "Recordatorios de carritos abandonados",
  },
  {
    name: "review-invite",
    endpointPath: "/api/cron/review-invite",
    method: "POST",
    schedule: "diario 08:00 UTC",
    scheduleCron: "0 8 * * *",
    frequencyHours: 24,
    description: "Invitación a dejar review 7 días tras entrega",
  },
  {
    name: "backup-db",
    endpointPath: "/api/cron/backup-db",
    method: "POST",
    schedule: "diario 03:00 UTC (vía /root/backup-merch.sh)",
    scheduleCron: "0 3 * * *",
    frequencyHours: 24,
    description: "Backup completo Postgres (.sql.gz) — manejado por bash de root con retención 14d local + Telegram",
  },
  {
    name: "post-order-drip",
    endpointPath: "/api/cron/post-order-drip",
    method: "POST",
    schedule: "diario 07:00 UTC",
    scheduleCron: "0 7 * * *",
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
    schedule: "diario 10:00 UTC",
    scheduleCron: "0 10 * * *",
    frequencyHours: 24,
    description: "Seguimiento de cotizaciones con enlace de pago enviado sin pagar (D2/D5/D10)",
  },
  {
    name: "proposal-followup",
    endpointPath: "/api/cron/proposal-followup",
    method: "POST",
    schedule: "diario 11:00 UTC",
    scheduleCron: "0 11 * * *",
    frequencyHours: 24,
    description: "Seguimiento de propuestas (PDF) enviadas sin responder (D3/D7)",
  },
];

export function findCron(name: string): CronEntry | null {
  return CRON_CATALOG.find((c) => c.name === name) || null;
}
