"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

/**
 * Widget flotante del agente de voz Carmen (ElevenLabs Conversational AI).
 * Estados visuales:
 *   - idle: pildora compacta con micro
 *   - connecting: spinner + "Conectando…"
 *   - active (listening/speaking): panel grande con transcript + onda + cerrar
 *   - ended: chip "¿Te ayudó? ¿Quieres llamada humana?"
 *
 * El envuelve <ConversationProvider> el hook useConversation. Sin proveedor
 * dentro del árbol, el hook tira error. Por eso exportamos el wrapper.
 */
export function VoiceAgentWidget() {
  return (
    <ConversationProvider>
      <VoiceAgentInner />
    </ConversationProvider>
  );
}

type Message = { role: "user" | "agent"; text: string; at: number };

function VoiceAgentInner() {
  const [open, setOpen] = useState(false);
  const [bootingError, setBootingError] = useState<string | null>(null);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("Carmen");
  const [messages, setMessages] = useState<Message[]>([]);
  const [productSlugsDiscussed, setProductSlugsDiscussed] = useState<Set<string>>(new Set());
  const startedAtRef = useRef<number | null>(null);
  const toolsCalledRef = useRef<Array<{ tool: string; ok: boolean; at: string }>>([]);

  const c = useConversation({
    onConnect: () => {
      startedAtRef.current = Date.now();
    },
    onMessage: ({ message, source }: { message: string; source: "user" | "ai" }) => {
      if (!message) return;
      setMessages((m) => [
        ...m,
        { role: source === "user" ? "user" : "agent", text: message, at: Date.now() },
      ]);
      // Detección heurística de slugs discutidos (los tools pasan por el server,
      // no nos llegan aquí — esta heurística es solo para tracking aproximado)
      const slugMatch = message.match(/\b\/catalogo\/([a-z0-9-]+)/g);
      if (slugMatch) {
        setProductSlugsDiscussed((s) => {
          const next = new Set(s);
          for (const m of slugMatch) next.add(m.replace("/catalogo/", ""));
          return next;
        });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setBootingError(msg.slice(0, 200));
    },
    onAgentToolRequest: (info: { tool_name: string }) => {
      toolsCalledRef.current.push({
        tool: info.tool_name,
        ok: true,
        at: new Date().toISOString(),
      });
    },
  });

  const isActive = c.status === "connected";
  const isConnecting = c.status === "connecting";

  // ── Start session ───────────────────────────────────────────────
  const start = useCallback(async () => {
    setBootingError(null);
    setMessages([]);
    try {
      const r = await fetch("/api/voice-agent/signed-url");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `signed-url HTTP ${r.status}`);
      }
      const j = await r.json();
      setVoiceSessionId(j.voiceSessionId);
      if (j.agentName) setAgentName(j.agentName);
      // signedUrl SOLO soporta websocket (la API de ElevenLabs lo exige).
      // WebRTC sería con conversationToken, no aplica aquí.
      c.startSession({ signedUrl: j.signedUrl, connectionType: "websocket" });
    } catch (err) {
      setBootingError(err instanceof Error ? err.message : String(err));
    }
  }, [c]);

  // ── End session ─────────────────────────────────────────────────
  const stop = useCallback(async () => {
    try {
      c.endSession();
    } catch {}
    const start = startedAtRef.current || Date.now();
    const durationSec = Math.round((Date.now() - start) / 1000);
    if (voiceSessionId) {
      // Notificamos al backend para tracking
      fetch("/api/voice-agent/session-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_session_id: voiceSessionId,
          elevenlabs_conversation_id: c.getId?.() || null,
          duration_sec: durationSec,
          tools_called: toolsCalledRef.current,
          product_slugs_discussed: Array.from(productSlugsDiscussed),
        }),
      }).catch(() => {});
    }
    startedAtRef.current = null;
    toolsCalledRef.current = [];
  }, [c, voiceSessionId, productSlugsDiscussed]);

  // Cerrar sesión si el usuario cierra la pestaña con conversación activa
  useEffect(() => {
    const handler = () => {
      if (isActive) stop();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isActive, stop]);

  // Visualización de onda — Carmen viva.
  //
  // Mejoras 2026-05-24 (Design Spell B1):
  // - Color y amplitud TRANSICIONAN suavemente entre hablar↔escuchar (no salto
  //   brusco). Cuando Carmen habla → magenta vibrante con amplitud alta. Cuando
  //   escucha → gris suave con amplitud baja.
  // - Gradiente vertical por barra (más oscuro al centro, más claro arriba/abajo)
  //   para sensación orgánica.
  // - Suavizado temporal: cada frame interpola hacia el target real → onda fluida
  //   en lugar de "saltos" cuando llega un buffer nuevo del WebAudio.
  // - Bordes redondeados con `roundRect` (Chrome 99+, Safari 16+, FF 109+).
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!isActive) return;
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const slices = 36;
    const sliceW = w / slices;

    // Estado animado: cada barra tiene su "altura actual" que persigue al target
    const heights = new Float32Array(slices);
    // Modo animado: 1 = hablando, 0 = escuchando. Interpola entre ambos.
    let mode = 0;

    // Helper RGB lerp
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const colorIdle = { r: 0xa0, g: 0x9e, b: 0x98 }; // gris brand
    const colorActive = { r: 0xe6, g: 0x3e, b: 0x73 }; // magenta brand

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Suavizado de modo: ataque rápido (0.18), liberación lenta (0.08)
      const targetMode = c.isSpeaking ? 1 : 0;
      const ease = targetMode > mode ? 0.18 : 0.08;
      mode += (targetMode - mode) * ease;

      const data = c.isSpeaking
        ? c.getOutputByteFrequencyData()
        : c.getInputByteFrequencyData();
      const sample = data || new Uint8Array(slices);

      // Color interpolado entre idle ↔ active
      const r = Math.round(lerp(colorIdle.r, colorActive.r, mode));
      const g = Math.round(lerp(colorIdle.g, colorActive.g, mode));
      const b = Math.round(lerp(colorIdle.b, colorActive.b, mode));

      // Amplitud máxima escala con mode: escuchando 35% h, hablando 95% h
      const maxScale = lerp(0.35, 0.95, mode);

      for (let i = 0; i < slices; i++) {
        const idx = Math.floor((i / slices) * sample.length);
        const v = (sample[idx] || 0) / 255;

        // Atenuación leve a los extremos (curva en U invertida) para "sonrisa"
        const positional = 1 - Math.pow((i / (slices - 1)) * 2 - 1, 2) * 0.25;
        const target = Math.max(0.04, v * maxScale * positional);

        // Suavizado por barra (subida 0.35, bajada 0.18) → menos parpadeo
        const prev = heights[i] ?? 0;
        const followEase = target > prev ? 0.35 : 0.18;
        heights[i] = prev + (target - prev) * followEase;

        const barH = Math.max(2, heights[i]! * h);
        const x = i * sliceW + 1.5;
        const y = (h - barH) / 2;
        const bw = Math.max(1, sliceW - 3);
        const radius = Math.min(bw / 2, 3);

        // Gradiente vertical sutil — más opaco en el centro de la barra
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},1)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
        ctx.fillStyle = grad;

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, bw, barH, radius);
        } else {
          ctx.rect(x, y, bw, barH);
        }
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isActive, c]);

  return (
    <>
      {/* Botón flotante */}
      {!isActive && !isConnecting && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            start();
          }}
          aria-label="Hablar con Carmen, asistente de voz"
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-bone shadow-lg hover:bg-accent"
        >
          <MicIcon className="h-4 w-4" />
          Hablar con {agentName}
        </button>
      )}

      {/* Panel conversación activa */}
      {(open || isActive || isConnecting) && (
        <div className="fixed bottom-6 left-6 right-6 z-50 max-w-md rounded-2xl border border-line bg-white shadow-2xl md:right-auto">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isActive
                    ? c.isSpeaking
                      ? "animate-pulse bg-accent"
                      : "bg-social"
                    : isConnecting
                      ? "animate-pulse bg-amber-400"
                      : "bg-line"
                }`}
              />
              <p className="font-display text-sm font-semibold text-ink">
                {agentName}{" "}
                <span className="ml-1 text-[10px] uppercase tracking-wider text-ink/45">
                  {isConnecting
                    ? "conectando…"
                    : isActive
                      ? c.isSpeaking
                        ? "hablando"
                        : "escuchando"
                      : "asistente"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isActive) stop();
                setOpen(false);
              }}
              className="text-xs text-ink/55 hover:text-ink"
            >
              {isActive ? "Terminar" : "Cerrar"}
            </button>
          </header>

          {/* Onda */}
          {(isActive || isConnecting) && (
            <div className="bg-bone-soft px-4 py-3">
              <canvas
                ref={canvasRef}
                width={400}
                height={40}
                className="w-full"
                style={{ height: 40 }}
              />
            </div>
          )}

          {/* Transcripción */}
          <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-2">
            {bootingError && (
              <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-deep">
                ⚠ {bootingError}
              </p>
            )}
            {!isActive && !isConnecting && messages.length === 0 && !bootingError && (
              <p className="text-xs text-ink/55">
                Pulsa &quot;Hablar con {agentName}&quot; y permite el micro. {agentName} te ayuda con
                catálogo, precio orientativo y a pedir cotización por voz.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "agent" ? "bg-bone-soft text-ink/85" : "bg-accent/10 text-ink/85 ml-6"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          {/* Controles */}
          {isActive && (
            <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={() => c.setMuted(!c.isMuted)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  c.isMuted ? "bg-accent text-white" : "bg-bone-soft text-ink/70"
                }`}
              >
                {c.isMuted ? "Micro silenciado" : "Silenciar"}
              </button>
              <p className="text-[10px] text-ink/45">
                Conversaciones se anonimizan. Tu voz no se guarda.
              </p>
            </footer>
          )}
        </div>
      )}
    </>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
