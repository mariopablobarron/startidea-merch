import type { NextConfig } from "next";

// ── Headers de seguridad HTTP ────────────────────────────────────────────
// Aplica a TODA la respuesta de la app. Auditado con Mozilla Observatory.
//
// Decisiones tomadas:
//  - Content-Security-Policy en **Report-Only**, no en modo bloqueo. La
//    cabecera de bloqueo llevaba meses aplazada porque romper el pago o el
//    widget de voz en producción sale caro y la política se escribe a ciegas.
//    Report-Only deshace ese nudo: el navegador NO bloquea nada, solo informa
//    de lo que habría bloqueado. Así se mide con tráfico real y se pasa a
//    bloqueo cuando los informes salgan limpios — ver CSP_REPORT_ONLY abajo.
//  - HSTS 2 años + includeSubDomains + preload: el dominio sólo sirve HTTPS.
//  - Frame-Options DENY: la app no se embebe en iframes externos.
//  - Permissions-Policy denyall: no usamos camera/mic/geo, sí payment (Stripe).
//  - Cross-Origin-Opener-Policy same-origin: aísla pestañas con window.open.
//  - X-Powered-By deshabilitado (poweredByHeader: false abajo).

// ── Content-Security-Policy (Report-Only) ────────────────────────────────
// ⚠️ Esta cabecera **no bloquea nada**: `-Report-Only` hace que el navegador
// registre en consola lo que la política habría impedido y siga cargándolo.
// Es deliberado: es el paso previo a aplicarla de verdad, y permite descubrir
// los orígenes que faltan sin arriesgar el checkout ni el widget de voz.
//
// Orígenes, cada uno con su motivo (medidos en el código, no supuestos):
//  - 'unsafe-inline' en script-src: Next inyecta scripts inline de hidratación
//    y los `<Script id=…>` de GA4/Ads. Quitarlo exige nonces por request, que
//    es incompatible con las páginas estáticas que hoy sirve el sitio. Es la
//    parte floja de esta política y está aquí escrito para que se note.
//  - googletagmanager / connect.facebook.net / snap.licdn.com: GA4 y pixels,
//    que solo cargan con consentimiento pero necesitan estar permitidos.
//  - analytics.hubstartidea.es: Umami (también tras consentimiento).
//  - js.stripe.com + frame-src: Express Checkout monta el iframe de Stripe.
//  - api.elevenlabs.io y wss:: el SDK de voz de Carmen abre WebSocket/WebRTC.
//  - img-src https: data: blob:: las imágenes de catálogo pasan por el proxy
//    propio, pero next/image y los previews de mockup usan data:/blob:.
//  - frame-ancestors 'self': equivalente moderno del X-Frame-Options de arriba.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://snap.licdn.com https://analytics.hubstartidea.es https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://analytics.hubstartidea.es https://api.stripe.com https://api.elevenlabs.io https://px.ads.linkedin.com wss:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN (no DENY): el widget de David abre la ficha de producto en un
  // popup con iframe del propio dominio; DENY lo dejaba en blanco. El
  // clickjacking desde sitios ajenos sigue bloqueado.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // microphone=(self) lo necesita el widget de voz de Carmen (WebRTC en
    // /api/voice-agent). camera y geolocation siguen denegados — no los usamos.
    // payment=(self) lo necesita Stripe Checkout / Express Checkout.
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(self), geolocation=(), payment=(self), interest-cohort=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Quita la cabecera "x-powered-by: Next.js" — info técnica innecesaria.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // MidOcean CDN: cdn.midocean.com, cdn1.midocean.com, cdn2…
      { protocol: "https", hostname: "**.midocean.com" },
      { protocol: "https", hostname: "midocean.com" },
      // Print position images (zonas de marcaje)
      { protocol: "https", hostname: "**.cdn.midocean.com" },
      { protocol: "https", hostname: "printposition-img-api-v2.cdn.midocean.com" },
      { protocol: "https", hostname: "print-templates-v2.cdn.midocean.com" },
      // Makito
      { protocol: "https", hostname: "**.makito.es" },
      { protocol: "https", hostname: "makito.es" },
      // Propios
      { protocol: "https", hostname: "**.startidea.es" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    return [
      // Alias legacy → ruta canónica española
      { source: "/cart", destination: "/carrito", permanent: true },
      { source: "/cart/:path*", destination: "/carrito/:path*", permanent: true },
      // Migración de dominio: el sitio anterior de merchandising.startidea.es
      // tenía estas rutas y aquí no existen (daban 404). 301 para no romper
      // enlaces ni marcadores cuando el DNS apunte al VPS.
      { source: "/productos", destination: "/catalogo", permanent: true },
      { source: "/productos/:path*", destination: "/catalogo/:path*", permanent: true },
      { source: "/contacto", destination: "/#cotizar", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
    ];
  },
};

export default config;
