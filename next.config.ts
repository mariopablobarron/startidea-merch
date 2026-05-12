import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
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
    ];
  },
};

export default config;
