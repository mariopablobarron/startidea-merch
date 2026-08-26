"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

import { hasAnalyticsConsent, onConsentChange } from "@/lib/consent";

/**
 * Umami — analítica propia, alojada en analytics.hubstartidea.es.
 *
 * Estaba inyectado a pelo en `layout.tsx`, sin ninguna puerta: el script
 * salía hacia analytics.hubstartidea.es **en la primera carga de todo
 * visitante**, antes de que el banner de cookies apareciera siquiera. Y el
 * banner lo anunciaba entre las «Analíticas» opcionales, junto a GA4. Es
 * decir: se pedía permiso para algo que ya se había hecho.
 *
 * No es la excusa de siempre: que Umami no ponga cookies lo libra del
 * artículo 22.2 de la ePrivacy —el que exige consentimiento para *almacenar*
 * en el terminal—, pero no de la promesa que le hace el banner al usuario.
 * Ofrecer una casilla y medir igual cuando la desmarcan es una promesa
 * incumplida, y ese es motivo suficiente.
 *
 * Por eso este componente sigue **el mismo patrón que `AdsPixels`**: sin
 * `analytics: true` guardado, no se renderiza nada — ni el `<Script>`, ni una
 * petición al dominio de Umami. Y al aceptar en el banner se monta en el
 * acto, sin recargar, porque `onConsentChange` escucha el evento.
 *
 * ⚠️ Diferencia con `GoogleAnalytics`, que NO usa este gate: GA4 se apoya en
 * el Consent Mode v2 (`gtag('consent','default', …denied)`) para cargarse sin
 * medir hasta que el usuario acepta. Umami no tiene nada equivalente: o se
 * carga y mide, o no se carga. De ahí que aquí la puerta sea el montaje.
 */
export function UmamiAnalytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (hasAnalyticsConsent()) setConsented(true);
    return onConsentChange((consent) => setConsented(consent.analytics));
  }, []);

  if (!consented) return null;

  return (
    <Script
      defer
      src="https://analytics.hubstartidea.es/script.js"
      data-website-id="7ab5c23b-9087-43ae-99fb-40e6c46d6da0"
      strategy="afterInteractive"
    />
  );
}
