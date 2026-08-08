"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Cookie banner GDPR.
 *
 * Categorías (RGPD / LSSI España):
 *  - Técnicas/sesión: siempre activas (auth, carrito), no requieren consent.
 *  - Analíticas: GA4 + Umami (Umami no usa cookies pero igual lo pedimos
 *    formalmente para coherencia). Default: denegadas.
 *  - Marketing: pixels Meta/Google Ads/LinkedIn/Spotify. Default: denegadas.
 *
 * Persistencia: localStorage `merch:cookie-consent:v2` con value JSON:
 *   { analytics: bool, marketing: bool, ts: ISOString }
 *
 * Integración Google Consent Mode v2:
 *   Por defecto gtag('consent','default', ...) lo dejamos en denied.
 *   Al aceptar, actualizamos con gtag('consent','update', ...) y los
 *   eventos previos buffereados se envían retroactivamente.
 */

const STORAGE_KEY = "merch:cookie-consent:v2";

type Consent = {
  analytics: boolean;
  marketing: boolean;
  ts: string;
};

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(true); // default UI: marcado, pero hasta que pulsen aceptar no aplica
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Sin consent → mostrar banner
        setVisible(true);
        // gtag consent default denied (por si GA4 está cargado)
        applyGtagConsent({ analytics: false, marketing: false }, true);
        return;
      }
      const parsed = JSON.parse(raw) as Consent;
      applyGtagConsent({ analytics: parsed.analytics, marketing: parsed.marketing }, false);
    } catch {
      setVisible(true);
    }
  }, []);

  function save(consent: { analytics: boolean; marketing: boolean }) {
    const data: Consent = { ...consent, ts: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    applyGtagConsent(consent, false);
    window.dispatchEvent(new CustomEvent("merch:cookie-consent", { detail: consent }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferencias de cookies"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-line bg-bone shadow-xl"
    >
      <div className="p-5 lg:p-6">
        {!expanded ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <p className="font-display text-base font-semibold text-ink">
                🍪 Usamos cookies para mejorar tu experiencia
              </p>
              <p className="mt-1 text-sm text-ink/70">
                Cookies técnicas siempre activas (necesarias para el carrito).
                Para analíticas y marketing necesitamos tu permiso. Lee{" "}
                <Link href="/cookies" className="text-accent underline-offset-2 hover:underline">
                  nuestra política
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => save({ analytics: false, marketing: false })}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs font-medium text-ink/70 transition hover:border-ink hover:text-ink"
              >
                Solo necesarias
              </button>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs font-medium text-ink/70 transition hover:border-ink hover:text-ink"
              >
                Personalizar
              </button>
              <button
                type="button"
                onClick={() => save({ analytics: true, marketing: true })}
                className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-bone shadow-sm transition hover:bg-accent-dark"
              >
                Aceptar todo
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-display text-base font-semibold text-ink">Personaliza tus cookies</p>
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-line bg-bone-soft p-3">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-1 h-4 w-4 accent-accent"
                />
                <div className="flex-1">
                  <p className="font-medium text-ink">Técnicas / sesión (obligatorias)</p>
                  <p className="mt-0.5 text-xs text-ink/60">
                    Mantienen tu carrito, autenticación y preferencias. Sin ellas la web no
                    funcionaría.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bone-soft p-3 hover:border-accent">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-accent"
                />
                <div className="flex-1">
                  <p className="font-medium text-ink">Analíticas</p>
                  <p className="mt-0.5 text-xs text-ink/60">
                    Google Analytics 4 y Umami para entender qué páginas funcionan y mejorar
                    la web. IP anonimizada.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-bone-soft p-3 hover:border-accent">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-accent"
                />
                <div className="flex-1">
                  <p className="font-medium text-ink">Marketing</p>
                  <p className="mt-0.5 text-xs text-ink/60">
                    Pixels de Meta Ads, Google Ads, LinkedIn y Spotify para medir campañas
                    y mostrar contenidos relevantes.
                  </p>
                </div>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs text-ink/50 hover:text-accent"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => save({ analytics, marketing })}
                className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-bone shadow-sm transition hover:bg-accent-dark"
              >
                Guardar preferencias
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Empuja consent al dataLayer de gtag (Google Consent Mode v2).
 * Si no hay gtag cargado (GA4 no configurado), no hace nada.
 */
function applyGtagConsent(consent: { analytics: boolean; marketing: boolean }, isDefault: boolean) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  if (!w.gtag && !w.dataLayer) return;

  // Si no existe gtag function pero sí dataLayer, lo creamos como stub
  if (!w.gtag) {
    w.gtag = function gtag(...args: unknown[]) {
      (w.dataLayer = w.dataLayer || []).push(args);
    };
  }

  const cmd = isDefault ? "default" : "update";
  w.gtag("consent", cmd, {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: consent.analytics ? "granted" : "denied",
    security_storage: "granted",
  });
}
