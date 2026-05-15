/**
 * Helpers para disparar eventos a pixels publicitarios desde cualquier
 * componente client. Cada función dispara a Meta + Google Ads + LinkedIn
 * si están configurados; ignora silenciosamente los que no.
 *
 * Uso:
 *   trackPurchase({ value: 850.40, currency: "EUR", orderId: "abc123" });
 *   trackAddToCart({ value: 120, currency: "EUR" });
 *   trackViewContent({ contentId: "ar1249", contentName: "Camiseta básica" });
 *   trackLead({ value: 0 }); // cuando se suscribe al newsletter
 */

type FbqArgs =
  | ["track", string, Record<string, unknown>?]
  | ["trackCustom", string, Record<string, unknown>?];

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    lintrk?: (action: string, params: Record<string, unknown>) => void;
  }
}

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GOOGLE_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_CONVERSION_LABEL;

function fbq(...args: FbqArgs) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq(...args);
}

function gtagEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", eventName, params);
}

function gtagConversion(label: string, value?: number, currency = "EUR", orderId?: string) {
  if (!GOOGLE_ADS_ID) return;
  gtagEvent("conversion", {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
    value,
    currency,
    transaction_id: orderId,
  });
}

function lintrkConv(conversionId?: string) {
  if (typeof window === "undefined" || !window.lintrk || !conversionId) return;
  window.lintrk("track", { conversion_id: conversionId });
}

// ─── Eventos ────────────────────────────────────────────────────────

export function trackPurchase(args: {
  value: number;
  currency?: string;
  orderId?: string;
  numItems?: number;
}) {
  const currency = args.currency || "EUR";
  fbq("track", "Purchase", {
    value: args.value,
    currency,
    num_items: args.numItems,
    content_ids: args.orderId ? [args.orderId] : undefined,
  });
  if (GOOGLE_CONVERSION_LABEL) {
    gtagConversion(GOOGLE_CONVERSION_LABEL, args.value, currency, args.orderId);
  } else {
    gtagEvent("purchase", {
      value: args.value,
      currency,
      transaction_id: args.orderId,
    });
  }
  lintrkConv(process.env.NEXT_PUBLIC_LINKEDIN_PURCHASE_CONV_ID);
}

export function trackAddToCart(args: {
  value?: number;
  currency?: string;
  contentId?: string;
  contentName?: string;
}) {
  const currency = args.currency || "EUR";
  fbq("track", "AddToCart", {
    value: args.value,
    currency,
    content_ids: args.contentId ? [args.contentId] : undefined,
    content_name: args.contentName,
  });
  gtagEvent("add_to_cart", {
    value: args.value,
    currency,
    items: args.contentId
      ? [{ item_id: args.contentId, item_name: args.contentName }]
      : undefined,
  });
}

export function trackViewContent(args: {
  contentId?: string;
  contentName?: string;
  category?: string;
  value?: number;
}) {
  fbq("track", "ViewContent", {
    content_ids: args.contentId ? [args.contentId] : undefined,
    content_name: args.contentName,
    content_category: args.category,
    value: args.value,
    currency: "EUR",
  });
  gtagEvent("view_item", {
    items: args.contentId
      ? [
          {
            item_id: args.contentId,
            item_name: args.contentName,
            item_category: args.category,
          },
        ]
      : undefined,
    value: args.value,
    currency: "EUR",
  });
}

export function trackLead(args: { value?: number; method?: string } = {}) {
  fbq("track", "Lead", {
    value: args.value ?? 0,
    currency: "EUR",
  });
  gtagEvent("generate_lead", {
    method: args.method,
    value: args.value,
    currency: "EUR",
  });
  lintrkConv(process.env.NEXT_PUBLIC_LINKEDIN_LEAD_CONV_ID);
}

export function trackInitiateCheckout(args: {
  value: number;
  currency?: string;
  numItems?: number;
}) {
  const currency = args.currency || "EUR";
  fbq("track", "InitiateCheckout", {
    value: args.value,
    currency,
    num_items: args.numItems,
  });
  gtagEvent("begin_checkout", { value: args.value, currency });
}
