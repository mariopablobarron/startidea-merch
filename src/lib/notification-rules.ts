/**
 * Reglas de notificación admin — qué eventos disparan push browser.
 *
 * Por defecto TODAS activadas (con thresholds razonables). Admin las
 * desactiva o ajusta desde /admin/insights/notifications.
 */
import { prisma } from "@/lib/prisma";

export type NotificationEvent =
  | "proposal_received"
  | "recommender_query"
  | "search_no_results"
  | "carmen_session"
  | "stock_critical";

export type NotificationChannels = {
  push: boolean;
  slack: boolean;
};

export type NotificationRule = {
  event: NotificationEvent;
  enabled: boolean;
  channels?: NotificationChannels;
  threshold?: number; // umbral si aplica (ej. ≥5 hits/24h)
};

const ALL_CHANNELS: NotificationChannels = { push: true, slack: true };
const PUSH_ONLY: NotificationChannels = { push: true, slack: false };

const DEFAULTS: Record<NotificationEvent, NotificationRule> = {
  proposal_received: {
    event: "proposal_received",
    enabled: true,
    channels: ALL_CHANNELS,
  },
  recommender_query: {
    event: "recommender_query",
    enabled: false,
    channels: PUSH_ONLY,
  },
  search_no_results: {
    event: "search_no_results",
    enabled: true,
    threshold: 5,
    channels: ALL_CHANNELS,
  },
  carmen_session: {
    event: "carmen_session",
    enabled: false,
    channels: PUSH_ONLY,
  },
  stock_critical: {
    event: "stock_critical",
    enabled: true,
    threshold: 10,
    channels: ALL_CHANNELS,
  },
};

export const NOTIFICATION_EVENTS: { event: NotificationEvent; label: string; help: string }[] = [
  {
    event: "proposal_received",
    label: "Propuesta enviada",
    help: "Cliente recibió un PDF de cotización por email desde /recomendador.",
  },
  {
    event: "recommender_query",
    label: "Consulta al recomendador",
    help: "Cada brief procesado por el chatbot IA. Útil al lanzar campaña — desactiva en operación normal para no saturarte.",
  },
  {
    event: "search_no_results",
    label: "Demanda no cubierta",
    help: "Una query del navbar devuelve 0 resultados con N+ hits en 24h. Threshold ajustable.",
  },
  {
    event: "carmen_session",
    label: "Conversación de voz con Carmen",
    help: "Visitante terminó sesión con el agente de voz. Útil para revisar transcripciones recién frescas.",
  },
  {
    event: "stock_critical",
    label: "Stock crítico de producto popular",
    help: "Producto del top 30d cuyas variantes bajan del threshold. Permite reordenar antes de quedarte sin stock.",
  },
];

let CACHE: { at: number; rules: Record<NotificationEvent, NotificationRule> } | null = null;
const CACHE_TTL_MS = 60_000; // 1 min — para que cambios admin se apliquen rápido

export async function getNotificationRules(): Promise<Record<NotificationEvent, NotificationRule>> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL_MS) return CACHE.rules;
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "notification_rules" },
      select: { value: true },
    });
    const stored = (row?.value as Partial<Record<NotificationEvent, NotificationRule>>) ?? {};
    const merged: Record<NotificationEvent, NotificationRule> = { ...DEFAULTS };
    for (const ev of Object.keys(DEFAULTS) as NotificationEvent[]) {
      if (stored[ev]) merged[ev] = { ...DEFAULTS[ev], ...stored[ev] };
    }
    CACHE = { at: Date.now(), rules: merged };
    return merged;
  } catch {
    return DEFAULTS;
  }
}

export async function isNotificationEnabled(event: NotificationEvent): Promise<boolean> {
  const rules = await getNotificationRules();
  return rules[event]?.enabled ?? false;
}

export async function getEnabledChannels(
  event: NotificationEvent,
): Promise<NotificationChannels> {
  const rules = await getNotificationRules();
  const rule = rules[event];
  if (!rule?.enabled) return { push: false, slack: false };
  return rule.channels ?? ALL_CHANNELS;
}

export async function getNotificationThreshold(event: NotificationEvent): Promise<number | undefined> {
  const rules = await getNotificationRules();
  return rules[event]?.threshold;
}

export async function setNotificationRules(
  rules: Partial<Record<NotificationEvent, Partial<NotificationRule>>>,
): Promise<Record<NotificationEvent, NotificationRule>> {
  const current = await getNotificationRules();
  const next = { ...current };
  for (const ev of Object.keys(rules) as NotificationEvent[]) {
    next[ev] = { ...next[ev], ...rules[ev], event: ev } as NotificationRule;
  }
  await prisma.adminSetting.upsert({
    where: { key: "notification_rules" },
    create: { key: "notification_rules", value: next },
    update: { value: next },
  });
  CACHE = { at: Date.now(), rules: next };
  return next;
}
