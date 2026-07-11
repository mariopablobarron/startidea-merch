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
  // Nombre por defecto del asesor. Se sobrescribe con ELEVENLABS_AGENT_NAME
  // del env (ver /api/voice-agent/signed-url). "Diego" = voz masculina ES.
  const [agentName, setAgentName] = useState("Diego");
  const [messages, setMessages] = useState<Message[]>([]);
  // Entrada por TEXTO (misma sesión: Diego responde con voz + transcripción).
  const [draft, setDraft] = useState("");
  // true = sesión sin micro (el usuario denegó permiso → chat escrito).
  const [textOnlyMode, setTextOnlyMode] = useState(false);
  // Contexto pendiente de enviar a Diego cuando conecte (viene de AskDiego).
  const pendingContextRef = useRef<string | null>(null);
  const [productSlugsDiscussed, setProductSlugsDiscussed] = useState<Set<string>>(new Set());
  const startedAtRef = useRef<number | null>(null);
  const toolsCalledRef = useRef<Array<{ tool: string; ok: boolean; at: string }>>([]);

  const c = useConversation({
    onConnect: () => {
      startedAtRef.current = Date.now();
    },
    onMessage: ({ message, source }: { message: string; source: "user" | "ai" }) => {
      if (!message) return;
      setMessages((m) => {
        // Anti-eco: si el usuario acaba de teclear este mismo texto (sendText
        // ya lo pintó), no lo dupliques cuando el SDK lo devuelva.
        const last = m[m.length - 1];
        if (
          source === "user" &&
          last?.role === "user" &&
          last.text === message &&
          Date.now() - last.at < 5000
        ) {
          return m;
        }
        return [...m, { role: source === "user" ? "user" : "agent", text: message, at: Date.now() }];
      });
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
  // Voz por defecto; si el usuario DENIEGA el micrófono, reintentamos la
  // sesión en modo solo-texto (chat escrito) en vez de fallar — nadie se
  // queda fuera por no querer dar el micro.
  const fetchSignedUrl = useCallback(async () => {
    const r = await fetch("/api/voice-agent/signed-url");
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `signed-url HTTP ${r.status}`);
    }
    const j = await r.json();
    setVoiceSessionId(j.voiceSessionId);
    if (j.agentName) setAgentName(j.agentName);
    return j.signedUrl as string;
  }, []);

  const start = useCallback(async () => {
    setBootingError(null);
    setMessages([]);
    setTextOnlyMode(false);
    try {
      const signedUrl = await fetchSignedUrl();
      // signedUrl SOLO soporta websocket (la API de ElevenLabs lo exige).
      // WebRTC sería con conversationToken, no aplica aquí.
      await c.startSession({ signedUrl, connectionType: "websocket" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Permiso de micro denegado/no disponible → sesión de chat escrito.
      if (/permission|denied|notallowed|notfound|mic/i.test(msg)) {
        try {
          const signedUrl = await fetchSignedUrl(); // URL nueva (single-use)
          await c.startSession({ signedUrl, connectionType: "websocket", textOnly: true });
          setTextOnlyMode(true);
          return;
        } catch (err2) {
          setBootingError(err2 instanceof Error ? err2.message : String(err2));
          return;
        }
      }
      setBootingError(msg);
    }
  }, [c, fetchSignedUrl]);

  // ── Enviar mensaje ESCRITO (misma sesión; Diego contesta con voz+texto) ──
  const sendText = useCallback(() => {
    const text = draft.trim();
    if (!text || c.status !== "connected") return;
    // El transcript del usuario tecleado no siempre llega por onMessage:
    // lo pintamos localmente (el guard de duplicados está en onMessage).
    setMessages((m) => [...m, { role: "user", text, at: Date.now() }]);
    try {
      c.sendUserMessage(text);
    } catch {
      /* sesión caída: el status lo reflejará */
    }
    setDraft("");
  }, [c, draft]);

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

  // ── Apertura desde cualquier punto de la web (componente AskDiego) ──
  // El evento trae opcionalmente contexto ("el cliente está viendo X"): se
  // envía a Diego como actualización contextual, no como mensaje del usuario.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const context = (e as CustomEvent<{ context?: string }>).detail?.context ?? null;
      setOpen(true);
      if (c.status === "connected") {
        if (context) {
          try {
            c.sendContextualUpdate(context);
          } catch {}
        }
      } else {
        pendingContextRef.current = context;
        void start();
      }
    };
    window.addEventListener("diego:open", onOpen);
    return () => window.removeEventListener("diego:open", onOpen);
  }, [c, start]);

  // Al conectar, volcar el contexto pendiente (si lo había).
  useEffect(() => {
    if (c.status !== "connected") return;
    const ctx = pendingContextRef.current;
    if (!ctx) return;
    pendingContextRef.current = null;
    try {
      c.sendContextualUpdate(ctx);
    } catch {}
  }, [c.status, c]);

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
          aria-label={`Hablar o escribir con ${agentName}, asesor comercial`}
          className="fixed bottom-24 right-6 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-bone shadow-lg hover:bg-accent"
        >
          <MicIcon className="h-4 w-4" />
          Habla o escribe a {agentName}
        </button>
      )}

      {/* Panel conversación activa */}
      {(open || isActive || isConnecting) && (
        <div className="fixed bottom-6 left-6 right-6 z-50 max-w-md rounded-2xl border border-line bg-white shadow-2xl sm:left-auto">
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
                      ? textOnlyMode
                        ? "chat"
                        : c.isSpeaking
                          ? "hablando"
                          : "escuchando"
                      : "asesor"}
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

          {/* Onda (solo con audio; en modo chat no hay streams) */}
          {(isActive || isConnecting) && !textOnlyMode && (
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
                {agentName} te ayuda a elegir producto, te da precio al momento y te prepara el
                presupuesto. Puedes hablarle o escribirle — si no das permiso de micro, seguirá
                por chat.
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

          {/* Controles: entrada de TEXTO (siempre) + micro (si hay voz) */}
          {isActive && (
            <footer className="border-t border-line px-4 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendText();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    // Señal de actividad: evita que Diego interrumpa mientras escribes.
                    try {
                      c.sendUserActivity();
                    } catch {}
                  }}
                  placeholder={textOnlyMode ? "Escribe tu mensaje…" : "…o escríbelo aquí"}
                  aria-label={`Escribir a ${agentName}`}
                  className="min-w-0 flex-1 rounded-full border border-line bg-bone-soft px-3.5 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Enviar mensaje"
                  className="rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-bone hover:bg-accent disabled:opacity-40"
                >
                  Enviar
                </button>
                {!textOnlyMode && (
                  <button
                    type="button"
                    onClick={() => c.setMuted(!c.isMuted)}
                    aria-label={c.isMuted ? "Activar micrófono" : "Silenciar micrófono"}
                    className={`rounded-full px-3 py-2 text-xs ${
                      c.isMuted ? "bg-accent text-white" : "bg-bone-soft text-ink/70"
                    }`}
                  >
                    <MicIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
              <p className="mt-2 text-[10px] text-ink/45">
                {textOnlyMode
                  ? "Modo chat (sin micrófono). Conversaciones anonimizadas."
                  : "Habla o escribe — como prefieras. Tu voz no se guarda."}
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
