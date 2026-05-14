import Script from "next/script";

/**
 * GA4 (Google Analytics 4) + Google Search Console verification.
 *
 * Activación vía env vars (en Coolify):
 *   NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX
 *   NEXT_PUBLIC_GSC_VERIFICATION=<token largo que da Search Console>
 *
 * Si ambas faltan, no renderiza nada (cero overhead).
 *
 * Anonimización IP por defecto + flags cookies estrictas. Si más adelante
 * añades cookie consent, gestionar via gtag('consent', 'default', ...).
 */
export function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA4_ID;
  const gscToken = process.env.NEXT_PUBLIC_GSC_VERIFICATION;

  if (!gaId && !gscToken) return null;

  return (
    <>
      {gscToken && <meta name="google-site-verification" content={gscToken} />}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              // Consent Mode v2: por defecto todo denied hasta que el banner
              // de cookies persista la preferencia del usuario. CookieBanner
              // emite gtag('consent','update',...) con sus elecciones.
              gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                functionality_storage: 'granted',
                personalization_storage: 'denied',
                security_storage: 'granted',
                wait_for_update: 500
              });
              gtag('config', '${gaId}', {
                anonymize_ip: true,
                cookie_flags: 'SameSite=Strict;Secure'
              });
            `}
          </Script>
        </>
      )}
    </>
  );
}
