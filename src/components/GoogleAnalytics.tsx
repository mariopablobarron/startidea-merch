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
              gtag('js', new Date());
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
