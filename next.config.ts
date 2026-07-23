import type { NextConfig } from "next";

// ── Headers de seguridad HTTP ────────────────────────────────────────────
// Aplica a TODA la respuesta de la app. Auditado con Mozilla Observatory.
//
// Decisiones tomadas:
//  - Sin Content-Security-Policy todavía: una CSP estricta requiere testing
//    exhaustivo con Stripe Checkout (iframes) y los scripts inline que Next
//    inyecta. Pendiente sprint específico.
//  - HSTS 2 años + includeSubDomains + preload: el dominio sólo sirve HTTPS.
//  - Frame-Options DENY: la app no se embebe en iframes externos.
//  - Permissions-Policy denyall: no usamos camera/mic/geo, sí payment (Stripe).
//  - Cross-Origin-Opener-Policy same-origin: aísla pestañas con window.open.
//  - X-Powered-By deshabilitado (poweredByHeader: false abajo).
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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
