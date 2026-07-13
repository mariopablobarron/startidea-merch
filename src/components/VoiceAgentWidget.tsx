"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { trackLead } from "@/lib/ads-events";

/**
 * Widget flotante del agente de voz Diego (ElevenLabs Conversational AI).
 * Estados visuales:
 *   - idle: pildora compacta con micro
 *   - connecting: spinner + "Conectando…"
 *   - active (listening/speaking): panel grande con transcript + onda + cerrar
 *
 * Robustez de arranque (2026-07-12, "se queda pillado"):
 *   - El permiso de micro se pide ANTES de la signed URL: la URL es de un solo
 *     uso y caduca; si el usuario tarda en responder al prompt del micro, la
 *     conexión moría colgada en "Conectando…".
 *   - Webviews sin getUserMedia (Instagram/LinkedIn…) → directo a modo chat.
 *   - Watchdog: si tras 20s sigue "connecting", se aborta y sale "Reintentar".
 *   - "Cerrar" aborta también durante la conexión; una desconexión inesperada
 *     ofrece "Reconectar" conservando la conversación.
 *
 * Música de espera: mientras conecta o mientras Diego "piensa" (el cliente ya
 * habló/escribió y aún no hay respuesta) suena un arpegio suave generado con
 * WebAudio — sin ficheros de audio ni licencias, volumen bajo para no ensuciar
 * el micrófono.
 *
 * Formulario silencioso: durante la conversación se muestra (sin que Diego lo
 * anuncie) un mini-formulario nombre/email/teléfono → POST /api/quote-request
 * (source diego-widget). Al enviarse se le pasa a Diego como contexto para que
 * no vuelva a pedir los datos.
 *
 * El wrapper <ConversationProvider> envuelve el hook useConversation. Sin
 * proveedor dentro del árbol, el hook tira error. Por eso exportamos el wrapper.
 */
export function VoiceAgentWidget() {
  return (
    <ConversationProvider>
      <VoiceAgentInner />
    </ConversationProvider>
  );
}

type Message = { role: "user" | "agent"; text: string; at: number };

type HoldMusic = { ctx: AudioContext; master: GainNode; timer: number };

const LEAD_STORAGE_KEY = "merch:diego-lead";

function startHoldMusic(ref: MutableRefObject<HoldMusic | null>) {
  if (ref.current) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    // Volumen bajo: es hilo musical de espera, no debe pisar la voz ni el micro.
    master.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 1.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    master.connect(filter);
    filter.connect(ctx.destination);

    // Pentatónica de Do — cualquier orden suena amable (sin disonancias).
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const pattern = [0, 2, 4, 3, 5, 4, 2, 1];
    let step = 0;
    const timer = window.setInterval(() => {
      const note = scale[pattern[step % pattern.length]]!;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = note * (1 + (Math.random() - 0.5) * 0.003);
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 1.5);
      step++;
    }, 420);
    ref.current = { ctx, master, timer };
  } catch {
    /* sin WebAudio: la espera es silenciosa, nada más */
  }
}

function stopHoldMusic(ref: MutableRefObject<HoldMusic | null>) {
  const m = ref.current;
  if (!m) return;
  ref.current = null;
  try {
    clearInterval(m.timer);
    const t = m.ctx.currentTime;
    m.master.gain.cancelScheduledValues(t);
    m.master.gain.setValueAtTime(Math.max(m.master.gain.value, 0.0001), t);
    m.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    setTimeout(() => {
      m.ctx.close().catch(() => {});
    }, 450);
  } catch {}
}

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
  // El cliente ya habló/escribió y Diego aún no ha contestado → música de espera.
  const [awaitingReply, setAwaitingReply] = useState(false);
  // La sesión se cayó sin que el usuario la terminara → ofrecer "Reconectar".
  const [dropped, setDropped] = useState(false);
  // Mini-formulario de contacto silencioso.
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadState, setLeadState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [leadHidden, setLeadHidden] = useState(false);
  // Contexto pendiente de enviar a Diego cuando conecte (viene de AskDiego).
  const pendingContextRef = useRef<string | null>(null);
  const [productSlugsDiscussed, setProductSlugsDiscussed] = useState<Set<string>>(new Set());
  const startedAtRef = useRef<number | null>(null);
  const toolsCalledRef = useRef<Array<{ tool: string; ok: boolean; at: string }>>([]);
  // true mientras la desconexión es intencionada (Terminar/watchdog): no
  // ofrecer "Reconectar" en ese caso.
  const userEndedRef = useRef(false);
  const musicRef = useRef<HoldMusic | null>(null);

  // Si ya dejó sus datos en una visita anterior, no volver a pedirlos.
  useEffect(() => {
    try {
      if (localStorage.getItem(LEAD_STORAGE_KEY)) setLeadHidden(true);
    } catch {}
  }, []);

  const c = useConversation({
    onConnect: () => {
      startedAtRef.current = Date.now();
    },
    onDisconnect: () => {
      if (!userEndedRef.current && startedAtRef.current) setDropped(true);
    },
    onMessage: ({ message, source }: { message: string; source: "user" | "ai" }) => {
      if (!message) return;
      setAwaitingReply(source === "user");
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
      // Los tools (cotizar, presupuesto…) tardan segundos: cuenta como espera.
      setAwaitingReply(true);
      toolsCalledRef.current.push({
        tool: info.tool_name,
        ok: true,
        at: new Date().toISOString(),
      });
    },
  });

  const isActive = c.status === "connected";
  const isConnecting = c.status === "connecting";

  // En cuanto Diego habla, ya no hay espera.
  useEffect(() => {
    if (c.isSpeaking) setAwaitingReply(false);
  }, [c.isSpeaking]);

  // ── Música de espera ────────────────────────────────────────────
  // Suena mientras conecta o mientras Diego piensa (tras hablar/escribir el
  // cliente). Arranca con ~1s de gracia para no sonar en respuestas rápidas.
  const musicOn = isConnecting || (isActive && awaitingReply && !c.isSpeaking);
  useEffect(() => {
    if (!musicOn) {
      stopHoldMusic(musicRef);
      return;
    }
    const t = setTimeout(() => startHoldMusic(musicRef), 1000);
    return () => {
      clearTimeout(t);
      stopHoldMusic(musicRef);
    };
  }, [musicOn]);

  // ── Start session ───────────────────────────────────────────────
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

  // Voz por defecto; sin micro (denegado o webview sin getUserMedia) → chat
  // escrito en la misma sesión. El permiso se resuelve ANTES de pedir la
  // signed URL (es de un solo uso y caduca mientras el usuario decide).
  const start = useCallback(
    async (opts?: { keepMessages?: boolean }) => {
      setBootingError(null);
      setDropped(false);
      setAwaitingReply(false);
      userEndedRef.current = false;
      if (!opts?.keepMessages) setMessages([]);
      setTextOnlyMode(false);

      let micGranted = false;
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          micGranted = true;
        } catch {
          micGranted = false;
        }
      }

      try {
        const signedUrl = await fetchSignedUrl();
        // signedUrl SOLO soporta websocket (la API de ElevenLabs lo exige).
        // WebRTC sería con conversationToken, no aplica aquí.
        if (micGranted) {
          await c.startSession({ signedUrl, connectionType: "websocket" });
        } else {
          await c.startSession({ signedUrl, connectionType: "websocket", textOnly: true });
          setTextOnlyMode(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Red de seguridad: si el arranque con voz aún tropieza con el micro,
        // reintento en chat escrito con URL nueva (single-use).
        if (micGranted && /permission|denied|not allowed|notallowed|notfound|dismissed|mic/i.test(msg)) {
          try {
            const signedUrl = await fetchSignedUrl();
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
    },
    [c, fetchSignedUrl],
  );

  // Watchdog: conexión que no cuaja en 20s → abortar y ofrecer reintento.
  useEffect(() => {
    if (!isConnecting) return;
    const t = setTimeout(() => {
      userEndedRef.current = true;
      try {
        c.endSession();
      } catch {}
      setBootingError("No se pudo conectar. Vuelve a intentarlo.");
    }, 20_000);
    return () => clearTimeout(t);
  }, [isConnecting, c]);

  // ── Enviar mensaje ESCRITO (misma sesión; Diego contesta con voz+texto) ──
  const sendText = useCallback(() => {
    const text = draft.trim();
    if (!text || c.status !== "connected") return;
    // El transcript del usuario tecleado no siempre llega por onMessage:
    // lo pintamos localmente (el guard de duplicados está en onMessage).
    setMessages((m) => [...m, { role: "user", text, at: Date.now() }]);
    setAwaitingReply(true);
    try {
      c.sendUserMessage(text);
    } catch {
      /* sesión caída: el status lo reflejará */
    }
    setDraft("");
  }, [c, draft]);

  // ── Formulario silencioso de contacto ───────────────────────────
  const leadValid = leadName.trim().length >= 2 && /\S+@\S+\.\S+/.test(leadEmail.trim());
  const submitLead = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!leadValid || leadState === "sending") return;
      setLeadState("sending");
      try {
        const r = await fetch("/api/quote-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: leadName.trim(),
            email: leadEmail.trim(),
            phone: leadPhone.trim(),
            message: `Lead del widget de ${agentName}: el cliente dejó sus datos en el formulario durante la conversación. Contactar cuanto antes.`,
            source: "diego-widget",
            productHint: Array.from(productSlugsDiscussed)[0] || "",
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setLeadState("sent");
        try {
          localStorage.setItem(LEAD_STORAGE_KEY, "1");
        } catch {}
        trackLead({ method: "diego-form" });
        // Diego se entera en silencio: que no vuelva a pedir los datos.
        try {
          c.sendContextualUpdate(
            `El cliente acaba de dejar sus datos de contacto en el formulario del widget (nombre: ${leadName.trim()}${leadPhone.trim() ? `, teléfono: ${leadPhone.trim()}` : ""}, email: ${leadEmail.trim()}). NO le pidas de nuevo el email ni el teléfono; si viene al caso, agradéceselo en una frase y confirma que le contactaremos.`,
          );
        } catch {}
      } catch {
        setLeadState("error");
      }
    },
    [leadValid, leadState, leadName, leadEmail, leadPhone, agentName, productSlugsDiscussed, c],
  );

  // ── End session ─────────────────────────────────────────────────
  const stop = useCallback(async () => {
    userEndedRef.current = true;
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

  // Visualización de onda — Diego vivo.
  //
  // Mejoras 2026-05-24 (Design Spell B1):
  // - Color y amplitud TRANSICIONAN suavemente entre hablar↔escuchar (no salto
  //   brusco). Cuando habla → magenta vibrante con amplitud alta. Cuando
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
            void start();
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
                          : awaitingReply
                            ? "pensando…"
                            : "escuchando"
                      : "asesor"}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isActive || isConnecting) stop();
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
          <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-2">
            {bootingError && (
              <div className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-deep">
                <p>⚠ {bootingError}</p>
                {!isActive && !isConnecting && (
                  <button
                    type="button"
                    onClick={() => void start({ keepMessages: true })}
                    className="mt-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-bone hover:bg-accent"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            )}
            {dropped && !bootingError && !isActive && !isConnecting && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-ink/75">
                <p>Se cortó la conexión.</p>
                <button
                  type="button"
                  onClick={() => void start({ keepMessages: true })}
                  className="mt-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-bone hover:bg-accent"
                >
                  Reconectar
                </button>
              </div>
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

          {/* Formulario silencioso: por si prefiere que le contactemos.
              Diego NO lo anuncia; simplemente está ahí. */}
          {isActive && !leadHidden && (
            <div className="border-t border-line bg-bone-soft/70 px-4 py-2.5">
              {leadState === "sent" ? (
                <p className="text-xs font-medium text-social">
                  ✓ Datos recibidos — te contactamos muy pronto.
                </p>
              ) : (
                <form onSubmit={submitLead} className="space-y-1.5">
                  <p className="text-[11px] text-ink/55">
                    ¿Prefieres que te llamemos? Deja tus datos (opcional):
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      placeholder="Nombre"
                      aria-label="Tu nombre"
                      autoComplete="name"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <input
                      type="tel"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      placeholder="Teléfono"
                      aria-label="Tu teléfono"
                      autoComplete="tel"
                      className="min-w-0 w-32 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      value={leadEmail}
                      onChange={(e) => setLeadEmail(e.target.value)}
                      placeholder="Email"
                      aria-label="Tu email"
                      autoComplete="email"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      disabled={!leadValid || leadState === "sending"}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep disabled:opacity-40"
                    >
                      {leadState === "sending" ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                  {leadState === "error" && (
                    <p className="text-[11px] text-accent-deep">
                      No se pudo enviar — inténtalo de nuevo.
                    </p>
                  )}
                </form>
              )}
            </div>
          )}

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
