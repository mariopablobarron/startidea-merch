"use client";

import { useEffect, useRef, useState } from "react";
import { SpinWheelPopup } from "@/components/SpinWheelPopup";
import { EmailCapturePopup } from "@/components/EmailCapturePopup";

/**
 * Wrapper A/B del popup de entrada. Asigna una variante estable por navegador
 * (50/50, localStorage) y muestra:
 *   - "ruleta"  → SpinWheelPopup
 *   - "classic" → EmailCapturePopup (cupón WELCOME10)
 *
 * Reutiliza el framework de experimentos existente: registra `view` (cuando el
 * popup se muestra) y `conversion` (cuando captura el email) en
 * `POST /api/track/experiment-event`. Si no hay experimento activo
 * (`/api/ruleta/ab` → null), no hay A/B y se muestra la ruleta sin tracking.
 *
 * Decide la variante en useEffect (no en SSR) para evitar mismatch de
 * hidratación; ambos popups renderizan null hasta que disparan sus triggers.
 */

const AB_KEY = "merch:entry-ab:v1";

export function EntryPopupAB() {
  const [variant, setVariant] = useState<"ruleta" | "classic" | null>(null);
  const expIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Variante estable por navegador
    let v: "ruleta" | "classic" = "ruleta";
    try {
      const stored = localStorage.getItem(AB_KEY);
      if (stored === "ruleta" || stored === "classic") {
        v = stored;
      } else {
        v = Math.random() < 0.5 ? "ruleta" : "classic";
        localStorage.setItem(AB_KEY, v);
      }
    } catch {
      v = "ruleta";
    }
    setVariant(v);

    // ¿Hay experimento activo? (para tracking)
    let active = true;
    fetch("/api/ruleta/ab")
      .then((r) => r.json())
      .then((d) => {
        if (active) expIdRef.current = (d && d.experimentId) || null;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function track(event: "view" | "conversion", variantKey: "ruleta" | "classic") {
    const experimentId = expIdRef.current;
    if (!experimentId) return;
    try {
      fetch("/api/track/experiment-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId, variantKey, event }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  if (!variant) return null;

  const handlers = {
    onShow: () => track("view", variant),
    onConvert: () => track("conversion", variant),
  };

  return variant === "ruleta" ? (
    <SpinWheelPopup {...handlers} />
  ) : (
    <EmailCapturePopup {...handlers} />
  );
}
