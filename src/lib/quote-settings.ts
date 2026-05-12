import { prisma } from "@/lib/prisma";

export const DEFAULT_QUOTE_SETTINGS = {
  heroTitle: "Cuéntanos qué necesitas.",
  heroSubtitle: "Te respondemos en 24h.",
  heroBullets: [
    "Cotización cerrada con precio final, marcaje y plazos.",
    "Sin compromiso. Sin coste. Sin letra pequeña.",
    "Asignamos producción a CEE o taller local según pedido.",
    "Te enviamos informe de impacto social al entregar.",
  ],
  responseHours: 24,
  requireCompany: false,
  requirePhone: false,
  requireDeadline: false,
  showBudgetField: true,
  deadlineOptions: [
    "Lo antes posible",
    "Esta semana",
    "Próximas 2-3 semanas",
    "1-2 meses",
    "Tengo flexibilidad",
  ],
  paymentMethods: [
    "Tarjeta (Stripe)",
    "Apple Pay / Google Pay",
    "Bizum",
    "Transferencia bancaria",
    "Pago contra factura 30 días",
  ],
  successTitle: "Recibido. Ya estamos en ello.",
  successMessage:
    "Te respondemos por email en menos de {hours} horas laborables con cotización cerrada.",
  autoReplyEnabled: true,
  autoReplySubject: "Recibimos tu solicitud · TodoMerchandising",
  autoReplyHtml: "",
  internalNotifyEmails: [] as string[],
  showOnHome: true,
};

export type QuoteSettingsData = typeof DEFAULT_QUOTE_SETTINGS;

/**
 * Lee settings del cotizador. Si no existe registro, devuelve defaults
 * (no crea row aún — se crea en primer save). Tolerante a fallo BD.
 */
export async function getQuoteSettings(): Promise<QuoteSettingsData> {
  try {
    const row = await prisma.quoteSettings.findUnique({ where: { id: "default" } });
    if (!row) return DEFAULT_QUOTE_SETTINGS;
    return {
      heroTitle: row.heroTitle || DEFAULT_QUOTE_SETTINGS.heroTitle,
      heroSubtitle: row.heroSubtitle || DEFAULT_QUOTE_SETTINGS.heroSubtitle,
      heroBullets: row.heroBullets.length > 0 ? row.heroBullets : DEFAULT_QUOTE_SETTINGS.heroBullets,
      responseHours: row.responseHours || 24,
      requireCompany: row.requireCompany,
      requirePhone: row.requirePhone,
      requireDeadline: row.requireDeadline,
      showBudgetField: row.showBudgetField,
      deadlineOptions:
        row.deadlineOptions.length > 0
          ? row.deadlineOptions
          : DEFAULT_QUOTE_SETTINGS.deadlineOptions,
      paymentMethods:
        row.paymentMethods.length > 0
          ? row.paymentMethods
          : DEFAULT_QUOTE_SETTINGS.paymentMethods,
      successTitle: row.successTitle || DEFAULT_QUOTE_SETTINGS.successTitle,
      successMessage: row.successMessage || DEFAULT_QUOTE_SETTINGS.successMessage,
      autoReplyEnabled: row.autoReplyEnabled,
      autoReplySubject: row.autoReplySubject || DEFAULT_QUOTE_SETTINGS.autoReplySubject,
      autoReplyHtml: row.autoReplyHtml || "",
      internalNotifyEmails: row.internalNotifyEmails || [],
      showOnHome: row.showOnHome,
    };
  } catch {
    return DEFAULT_QUOTE_SETTINGS;
  }
}
