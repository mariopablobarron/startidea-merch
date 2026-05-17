"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/**
 * Carga el widget de voz SOLO en rutas públicas (no en /admin/*).
 * Lazy via next/dynamic con ssr:false: no aporta nada al SSR y la SDK de
 * ElevenLabs es client-only (WebRTC, mic, etc.).
 */
const VoiceAgentWidget = dynamic(
  () => import("./VoiceAgentWidget").then((m) => m.VoiceAgentWidget),
  { ssr: false },
);

const HIDE_ON_PREFIXES = ["/admin", "/api", "/pay/"];

export function VoiceAgentGate() {
  const pathname = usePathname() || "";
  if (HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <VoiceAgentWidget />;
}
