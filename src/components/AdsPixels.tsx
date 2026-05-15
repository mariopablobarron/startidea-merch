import Script from "next/script";

/**
 * Pixels publicitarios — Meta (Facebook/Instagram) + Google Ads + LinkedIn.
 *
 * Activación vía env:
 *   NEXT_PUBLIC_META_PIXEL_ID         → Meta Pixel
 *   NEXT_PUBLIC_GOOGLE_ADS_ID         → Google Ads (formato AW-XXXXXXXXX)
 *   NEXT_PUBLIC_GOOGLE_CONVERSION_LABEL → label de conversión "Purchase"
 *   NEXT_PUBLIC_LINKEDIN_PARTNER_ID   → LinkedIn Insight Tag
 *
 * Si una env falta, ese pixel no se carga. Respeta Google Consent Mode
 * v2 (los pixels solo trackearán tras consent del usuario en cookie banner).
 *
 * Eventos custom se disparan desde el código con `trackPurchase()`,
 * `trackAddToCart()`, etc (helpers en src/lib/ads-events.ts).
 */
export function AdsPixels() {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const linkedInId = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;

  if (!metaPixelId && !googleAdsId && !linkedInId) return null;

  return (
    <>
      {metaPixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          {/* Fallback noscript */}
          <noscript>
            <img
              alt=""
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {googleAdsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              window.gtag = window.gtag || function(){dataLayer.push(arguments);};
              gtag('js', new Date());
              gtag('config', '${googleAdsId}');
            `}
          </Script>
        </>
      )}

      {linkedInId && (
        <>
          <Script id="linkedin-init" strategy="afterInteractive">
            {`
              _linkedin_partner_id = "${linkedInId}";
              window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
              window._linkedin_data_partner_ids.push(_linkedin_partner_id);
              (function(l) {
                if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
                window.lintrk.q=[]}
                var s = document.getElementsByTagName("script")[0];
                var b = document.createElement("script");
                b.type = "text/javascript";b.async = true;
                b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
                s.parentNode.insertBefore(b, s);
              })(window.lintrk);
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://px.ads.linkedin.com/collect/?pid=${linkedInId}&fmt=gif`}
            />
          </noscript>
        </>
      )}
    </>
  );
}
