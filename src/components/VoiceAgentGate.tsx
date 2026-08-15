"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isVoiceAgentMountedOnPath } from "@/lib/floating-surfaces";

/**
 * Carga el widget de voz solo donde puede ayudar sin invadir funnels de pago,
 * portales privados o pantallas de revisión.
 * Lazy via next/dynamic con ssr:false: no aporta nada al SSR y la SDK de
 * ElevenLabs es client-only (WebRTC, mic, etc.).
 */
const VoiceAgentWidget = dynamic(
  () => import("./VoiceAgentWidget").then((m) => m.VoiceAgentWidget),
  { ssr: false },
);

export function VoiceAgentGate() {
  const pathname = usePathname() || "";
  if (!isVoiceAgentMountedOnPath(pathname)) return null;
  return <VoiceAgentWidget />;
}
