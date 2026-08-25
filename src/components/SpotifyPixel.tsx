"use client";

import { useEffect } from "react";

import { hasMarketingConsent, onConsentChange } from "@/lib/consent";

const SPOTIFY_PIXEL_ID = "18ec3e2261264ed991f8ba10a2d90161";

type SpotifyPixelWindow = Window & {
  spdt?: ((command: string, payload?: { key: string }) => void) & {
    q?: unknown[][];
  };
  __spotifyPixelConfigured?: boolean;
};

function loadSpotifyPixel() {
  const w = window as SpotifyPixelWindow;
  if (w.__spotifyPixelConfigured) return;

  w.spdt =
    w.spdt ||
    function spdt(...args: unknown[]) {
      (w.spdt!.q = w.spdt!.q || []).push(args);
    };

  if (!document.getElementById("spdt-capture")) {
    const script = document.createElement("script");
    script.id = "spdt-capture";
    script.async = true;
    script.src = "https://pixel.byspotify.com/ping.min.js";
    document.head.appendChild(script);
  }

  w.__spotifyPixelConfigured = true;
  w.spdt("conf", { key: SPOTIFY_PIXEL_ID });
  w.spdt("view");
}

export function SpotifyPixel() {
  useEffect(() => {
    if (hasMarketingConsent()) loadSpotifyPixel();

    return onConsentChange((consent) => {
      if (consent.marketing) loadSpotifyPixel();
    });
  }, []);

  return null;
}
