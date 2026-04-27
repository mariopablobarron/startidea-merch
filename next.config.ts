import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.midocean.com" },
      { protocol: "https", hostname: "makito.es" },
      { protocol: "https", hostname: "**.startidea.es" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default config;
