/**
 * Consentimiento de cookies — fuente única de verdad para el lado cliente.
 *
 * Lo escribe `CookieBanner` en localStorage y lo anuncia con un CustomEvent;
 * lo leen los componentes que cargan scripts de terceros. Antes cada uno
 * llevaba su propia copia de la clave y del parseo, y así fue como Meta y
 * LinkedIn acabaron cargándose sin pasar por ningún permiso.
 *
 * Regla: si un script sale a un dominio ajeno, se pide permiso antes.
 */

export const CONSENT_STORAGE_KEY = "merch:cookie-consent:v2";
export const CONSENT_EVENT = "merch:cookie-consent";

export type CookieConsent = {
  analytics: boolean;
  marketing: boolean;
};

/** Lee el consentimiento guardado. `null` = el usuario aún no ha decidido. */
export function readConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return {
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
    };
  } catch {
    return null;
  }
}

/** Sin decisión explícita del usuario, `false`. Nunca se asume el sí. */
export function hasMarketingConsent(): boolean {
  return readConsent()?.marketing === true;
}

export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true;
}

/**
 * Suscribe a los cambios de consentimiento y devuelve la función de baja,
 * pensada para devolverla tal cual desde un `useEffect`.
 */
export function onConsentChange(
  handler: (consent: CookieConsent) => void,
): () => void {
  function listener(event: Event) {
    const detail = (event as CustomEvent<Partial<CookieConsent>>).detail;
    handler({
      analytics: detail?.analytics === true,
      marketing: detail?.marketing === true,
    });
  }
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}
