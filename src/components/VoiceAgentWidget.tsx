"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { usePathname } from "next/navigation";
import { trackLead } from "@/lib/ads-events";
import { addItem, readCart } from "@/lib/cart-storage";
import { cn } from "@/lib/cn";
import {
  FLOATING_SURFACES,
  isFloatingSurfaceAllowedOnPath,
  mobileFloatingOwner,
} from "@/lib/floating-surfaces";
import {
  useModalFocus,
  useModelessDialogFocus,
} from "@/lib/use-modal-focus";

/**
 * Widget flotante del agente de voz David (ElevenLabs Conversational AI).
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
 * Música de espera: mientras conecta o mientras David "piensa" (el cliente ya
 * habló/escribió y aún no hay respuesta) suena un arpegio suave generado con
 * WebAudio — sin ficheros de audio ni licencias, volumen bajo para no ensuciar
 * el micrófono.
 *
 * Formulario silencioso: durante la conversación se muestra (sin que David lo
 * anuncie) un mini-formulario nombre/email/teléfono → POST /api/quote-request
 * (source diego-widget). Al enviarse se le pasa a David como contexto para que
 * no vuelva a pedir los datos.
 *
 * El wrapper <ConversationProvider> envuelve el hook useConversation. Sin
 * proveedor dentro del árbol, el hook tira error. Por eso exportamos el wrapper.
 */
export function VoiceAgentWidget() {
  // Dentro de un iframe (la ficha en popup carga la página completa) el
  // widget NO debe montarse: duplicaría la píldora y pelearía por el micro.
  const [inIframe, setInIframe] = useState(false);
  useEffect(() => {
    if (window.self !== window.top) setInIframe(true);
  }, []);
  if (inIframe) return null;
  return (
    <ConversationProvider>
      <VoiceAgentInner />
    </ConversationProvider>
  );
}

type ProductCard = {
  slug: string;
  name: string;
  ref: string;
  image: string | null;
  priceFromCents: number | null;
  originalFromCents: number | null;
  variantId: string | null;
  requiresVariantSelection: boolean;
  url: string;
};

type Message =
  | { role: "user" | "agent"; text: string; at: number }
  | { role: "products"; items: ProductCard[]; at: number }
  | { role: "cart"; text: string; at: number };

type HoldMusic = { ctx: AudioContext; master: GainNode; timer: number };

const LEAD_STORAGE_KEY = "merch:diego-lead";
const COMPARE_STORAGE_KEY = "merch:compare";

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

/**
 * Instrucción para desbloquear el micrófono, adaptada al navegador/dispositivo
 * que entra: en móvil no hay 🔒 en la barra, y Safari/Firefox usan otro sitio.
 * Devuelve un texto corto y aproximado (la UI exacta cambia entre versiones),
 * suficiente para que la persona sepa dónde mirar.
 */
function micUnblockHint(): string {
  const tail = " Después vuelve a tocar el botón. Mientras, puedes escribirle abajo.";
  if (typeof navigator === "undefined") {
    return "Permite el micrófono en los ajustes del sitio de tu navegador (Micrófono → Permitir)." + tail;
  }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/.test(ua);
  const isChromeIOS = /CriOS/.test(ua);
  const isFirefoxIOS = /FxiOS/.test(ua);
  const isFirefox = /Firefox/.test(ua) || isFirefoxIOS;
  const isEdge = /Edg\//.test(ua);
  const isChromium = /Chrome|Chromium|CriOS/.test(ua);
  const isSafariDesktop = /Safari/.test(ua) && !isChromium && !isFirefox && !isIOS;

  // iOS: Safari usa el botón "aA"; Chrome/Firefox de iOS piden el permiso a nivel de sistema.
  if (isIOS) {
    if (isChromeIOS || isFirefoxIOS) {
      const app = isChromeIOS ? "Chrome" : "Firefox";
      return `En iPhone/iPad ve a Ajustes → ${app} → Micrófono y actívalo.` + tail;
    }
    return 'Toca "aA" a la izquierda de la barra de direcciones → Ajustes del sitio web → Micrófono → Permitir. Si no aparece, ve a Ajustes → Safari → Micrófono.' + tail;
  }
  // Android (Chrome y derivados): candado/icono de ajustes a la izquierda de la dirección.
  if (isAndroid) {
    return "Toca el icono a la izquierda de la dirección (🔒 o ⚙️) → Permisos → Micrófono → Permitir." + tail;
  }
  // Escritorio Safari.
  if (isSafariDesktop) {
    return "En el menú Safari → Ajustes para este sitio web → Micrófono → Permitir." + tail;
  }
  // Escritorio Firefox.
  if (isFirefox) {
    return "Pulsa el 🔒 a la izquierda de la dirección y quita el bloqueo de Micrófono (o Permisos → Micrófono → Permitir)." + tail;
  }
  // Escritorio Chrome / Edge / Chromium.
  if (isChromium || isEdge) {
    return "Pulsa el 🔒 (o el icono de controles del sitio) a la izquierda de la dirección → Micrófono → Permitir, y recarga." + tail;
  }
  // Fallback genérico.
  return "Permite el micrófono en los ajustes del sitio de tu navegador (Micrófono → Permitir)." + tail;
}

function VoiceAgentInner() {
  const pathname = usePathname() || "";
  // Catálogo y ficha concentran filtros/configurador/CTA de compra. Ahí una
  // invitación automática compite con la tarea principal y tapa controles en
  // móvil; el lanzador compacto sigue disponible para quien quiera usarlo.
  const suppressAutomaticNudge =
    pathname === "/catalogo" || pathname.startsWith("/catalogo/");
  const [open, setOpen] = useState(false);
  const [bootingError, setBootingError] = useState<string | null>(null);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  // Nombre por defecto del asesor. Se sobrescribe con ELEVENLABS_AGENT_NAME
  // del env (ver /api/voice-agent/signed-url). "David" = voz masculina ES.
  const [agentName, setAgentName] = useState("David");
  const [messages, setMessages] = useState<Message[]>([]);
  // Entrada por TEXTO (misma sesión: David responde con voz + transcripción).
  const [draft, setDraft] = useState("");
  // true = sesión sin micro (el usuario denegó permiso → chat escrito).
  const [textOnlyMode, setTextOnlyMode] = useState(false);
  // true = el cliente silenció a David para escribir con calma: su VOZ no
  // suena (setVolume 0) y su micro no escucha (setMuted) → chat de texto puro.
  const [voiceMuted, setVoiceMuted] = useState(false);
  // El cliente ya habló/escribió y David aún no ha contestado → música de espera.
  const [awaitingReply, setAwaitingReply] = useState(false);
  // La sesión se cayó sin que el usuario la terminara → ofrecer "Reconectar".
  const [dropped, setDropped] = useState(false);
  // Burbuja de invitación junto al botón flotante (nudge). Sale a los 5s si
  // no está snoozeada; abrir el widget la snooza 7 días, cerrarla con ✕, 24h.
  const [nudge, setNudge] = useState(false);
  // Mini-formulario de contacto silencioso.
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadState, setLeadState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [leadHidden, setLeadHidden] = useState(false);
  // En pantallas pequeñas el formulario arranca plegado a una línea: la
  // conversación necesita el espacio. En escritorio, desplegado.
  const [leadCollapsed, setLeadCollapsed] = useState(false);
  useEffect(() => {
    try {
      setLeadCollapsed(window.matchMedia("(max-width: 639px)").matches);
    } catch {}
  }, []);
  const [floatingCounts, setFloatingCounts] = useState({ cart: 0, compare: 0 });
  useEffect(() => {
    function refreshFloatingCounts() {
      let compare = 0;
      try {
        const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        compare = Array.isArray(parsed) ? parsed.length : 0;
      } catch {}
      setFloatingCounts({ cart: readCart().length, compare });
    }
    refreshFloatingCounts();
    window.addEventListener("merch:cart-change", refreshFloatingCounts);
    window.addEventListener("merch:compare-change", refreshFloatingCounts);
    window.addEventListener("storage", refreshFloatingCounts);
    return () => {
      window.removeEventListener("merch:cart-change", refreshFloatingCounts);
      window.removeEventListener("merch:compare-change", refreshFloatingCounts);
      window.removeEventListener("storage", refreshFloatingCounts);
    };
  }, []);
  // Contexto pendiente de enviar a David cuando conecte (viene de AskDiego).
  const pendingContextRef = useRef<string | null>(null);
  const [productSlugsDiscussed, setProductSlugsDiscussed] = useState<Set<string>>(new Set());
  // Tarjeta elegida por el cliente (toque directo) y ficha abierta en popup.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [fichaUrl, setFichaUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const productSheetRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number | null>(null);
  const toolsCalledRef = useRef<Array<{ tool: string; ok: boolean; at: string }>>([]);
  // true mientras la desconexión es intencionada (Terminar/watchdog): no
  // ofrecer "Reconectar" en ese caso.
  const userEndedRef = useRef(false);
  const musicRef = useRef<HoldMusic | null>(null);
  // Espejo del transcript para leerlo en stop() sin re-crear el callback.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  // Auto-scroll: sin esto el cliente no ve la respuesta nueva ni las tarjetas
  // (el div se quedaba arriba y parecía que David no contestaba).
  // Asignación DIRECTA tras el layout (rAF): el scroll suave se cancelaba con
  // cada mutación del DOM (mensajes encadenados + tarjetas) y se quedaba en 0
  // — verificado en prod con viewport móvil.
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages]);
  // Slugs ya mostrados como tarjeta: no repetir la misma foto en la sesión.
  const shownSlugsRef = useRef<Set<string>>(new Set());

  // ── Tarjetas de producto en la conversación ─────────────────────
  // Las dispara la tool de cliente `mostrar_productos` (David) o, como red,
  // cualquier mención de /catalogo/<slug> en sus mensajes.
  const showProducts = useCallback(async (rawSlugs: string[]): Promise<number> => {
    const slugs = rawSlugs
      .map((s) => s.trim().toLowerCase().replace(/^\/?catalogo\//, ""))
      .filter((s) => /^[a-z0-9-]{1,160}$/.test(s))
      .filter((s) => !shownSlugsRef.current.has(s))
      .slice(0, 6);
    if (slugs.length === 0) return 0;
    for (const s of slugs) shownSlugsRef.current.add(s);
    try {
      const r = await fetch(`/api/products/cards?slugs=${encodeURIComponent(slugs.join(","))}`);
      if (!r.ok) return 0;
      const j = (await r.json()) as { items?: ProductCard[] };
      const items = j.items || [];
      if (items.length === 0) return 0;
      setMessages((m) => [...m, { role: "products", items, at: Date.now() }]);
      setProductSlugsDiscussed((prev) => {
        const next = new Set(prev);
        for (const it of items) next.add(it.slug);
        return next;
      });
      return items.length;
    } catch {
      return 0;
    }
  }, []);

  // Si ya dejó sus datos en una visita anterior, no volver a pedirlos.
  useEffect(() => {
    try {
      if (localStorage.getItem(LEAD_STORAGE_KEY)) setLeadHidden(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (suppressAutomaticNudge) {
      setNudge(false);
      return;
    }
    try {
      const until = Number(localStorage.getItem("merch:diego-nudge-until") || 0);
      if (Date.now() < until) return;
    } catch {}
    // No competir con el banner de cookies (en móvil se solapaban): esperamos
    // a que el visitante decida y entonces la burbuja sale con 2,5s de calma.
    let show: ReturnType<typeof setTimeout> | null = null;
    const poll = setInterval(() => {
      let cookiesDecided = true;
      try {
        cookiesDecided = !!localStorage.getItem("merch:cookie-consent:v2");
      } catch {}
      if (cookiesDecided && !show) {
        clearInterval(poll);
        show = setTimeout(() => setNudge(true), 2500);
      }
    }, 1000);
    return () => {
      clearInterval(poll);
      if (show) clearTimeout(show);
    };
  }, [suppressAutomaticNudge]);

  const snoozeNudge = useCallback((hours: number) => {
    setNudge(false);
    try {
      localStorage.setItem("merch:diego-nudge-until", String(Date.now() + hours * 3600_000));
    } catch {}
  }, []);

  const c = useConversation({
    // Tools que se ejecutan EN el navegador. David llama a mostrar_productos
    // cuando recomienda productos concretos → tarjetas con foto en el panel.
    clientTools: {
      // Compra directa por conversación: David añade la línea al carrito REAL
      // de la web (localStorage compartido con la ficha y /carrito), con el
      // precio del MISMO cálculo server-side que usa el configurador.
      anadir_al_carrito: async (params: unknown) => {
        const p = (params ?? {}) as {
          slug?: string;
          quantity?: number | string;
          color?: string;
          size?: string;
          notes?: string;
          technique_code?: string;
          number_of_colors?: number | string;
          marking_position_id?: string;
        };
        const slug = String(p.slug || "").trim().toLowerCase().replace(/^\/?catalogo\//, "");
        const qty = Math.max(0, Math.round(Number(p.quantity) || 0));
        if (!/^[a-z0-9-]{1,160}$/.test(slug) || qty < 1) {
          return "Error: faltan slug válido o cantidad (entero ≥1).";
        }
        // MARCAJE (P0 auditoría 2026-07-15): si David cotizó CON impresión, la
        // línea del carrito debe llevar markings[] — el checkout recalcula el
        // precio autoritativo a partir de ellos (computeServerLinePricing) y
        // sin esto cobraba el producto SIN marcaje aunque se prometió con él.
        const tech = String(p.technique_code || "").trim().slice(0, 40) || null;
        const cols = Math.min(10, Math.max(1, Math.round(Number(p.number_of_colors) || 1)));
        try {
          const [cardR, calcR] = await Promise.all([
            fetch(`/api/products/cards?slugs=${encodeURIComponent(slug)}`),
            fetch("/api/quote/calculate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productSlug: slug,
                quantity: qty,
                ...(tech
                  ? { techniqueCode: tech, numberOfColours: cols, positionCount: 1 }
                  : {}),
              }),
            }),
          ]);
          const card = cardR.ok
            ? ((await cardR.json()) as { items?: ProductCard[] }).items?.[0]
            : undefined;
          const calc = calcR.ok
            ? ((await calcR.json()) as {
                ok?: boolean;
                unitClientCents?: number;
                totalClientCents?: number;
                markings?: Array<{
                  positionId?: string | null;
                  techniqueCode?: string | null;
                  techniqueName?: string | null;
                  warning?: string | null;
                }>;
              })
            : undefined;
          if (!card) return "Error: producto no encontrado o no disponible.";
          if (card.requiresVariantSelection) {
            return `Este producto necesita elegir color o talla en ${card.url}. No lo he añadido para evitar cursar una variante incorrecta.`;
          }
          // Posición: la resuelta por el servidor si viene; si no, la que diga
          // David; y como último recurso "AUTO" — el checkout tolera posición
          // inexacta (recae en cualquier posición del producto que soporte la
          // técnica), y lo importante es que markings[] NUNCA falte si hay
          // técnica: de eso depende que el cobro incluya la impresión.
          const calcMarking = tech ? calc?.markings?.[0] : undefined;
          const positionId =
            (calcMarking?.positionId || p.marking_position_id || "AUTO").trim().slice(0, 60) || "AUTO";
          const markings =
            tech
              ? [
                  {
                    positionId,
                    positionLabel: null,
                    techniqueCode: tech,
                    techniqueName: calcMarking?.techniqueName ?? null,
                    numberOfColors: cols,
                    manipulationCode: null,
                    printAreaCm2: null,
                    notes: null,
                  },
                ]
              : undefined;
          addItem({
            productSlug: card.slug,
            productRef: card.ref,
            productName: card.name,
            primaryImageUrl: card.image,
            quantity: qty,
            variantId: card.variantId,
            // La identidad la decide el servidor. Los atributos libres del
            // modelo no se persisten como si fueran metadata canónica.
            colorName: null,
            size: null,
            notes: p.notes?.trim() || null,
            markingTechniqueCode: markings ? tech : null,
            markingTechniqueName: markings ? (calcMarking?.techniqueName ?? null) : null,
            markingPositionId: markings ? positionId : null,
            markingColours: markings ? cols : null,
            markings,
            unitPriceClientCents: calc?.unitClientCents ?? null,
            totalClientCents: calc?.totalClientCents ?? null,
          });
          const totalTxt =
            calc?.totalClientCents != null
              ? (calc.totalClientCents / 100).toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                })
              : null;
          const markTxt = markings
            ? ` con ${calcMarking?.techniqueName || "marcaje"} (${cols} ${cols === 1 ? "color" : "colores"})`
            : "";
          setMessages((m) => [
            ...m,
            {
              role: "cart",
              text: `${qty} × ${card.name}${markTxt}${totalTxt ? ` — ${totalTxt} sin IVA` : ""}`,
              at: Date.now(),
            },
          ]);
          return `Añadido al carrito: ${qty} × ${card.name}${markTxt || (tech ? " (ATENCIÓN: el marcaje no pudo aplicarse, precio SIN personalización)" : " (sin personalización)")}${totalTxt ? `, total ${totalTxt} sin IVA` : ""}. El cliente puede finalizar la compra en el carrito de la web o seguir añadiendo productos.`;
        } catch {
          return "Error técnico al añadir al carrito. Ofrece el presupuesto por email como alternativa.";
        }
      },
      mostrar_productos: async (params: unknown) => {
        const p = (params ?? {}) as { slugs?: string[] | string };
        const arr = Array.isArray(p.slugs)
          ? p.slugs
          : typeof p.slugs === "string"
            ? p.slugs.split(",")
            : [];
        const shown = await showProducts(arr);
        return shown > 0
          ? `Mostradas ${shown} tarjetas de producto en pantalla.`
          : "No se mostraron tarjetas (slugs desconocidos o ya en pantalla).";
      },
    },
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
        // Anti-eco: el SDK puede repetir un mensaje (el texto tecleado que ya
        // pintamos, o la respuesta del agente duplicada tras un tool call).
        // Comparamos contra el último mensaje DE TEXTO aunque haya tarjetas
        // de producto en medio.
        const role = source === "user" ? ("user" as const) : ("agent" as const);
        const lastText = [...m]
          .reverse()
          .find((x): x is Extract<Message, { role: "user" | "agent" }> => x.role === "user" || x.role === "agent");
        if (
          lastText &&
          lastText.role === role &&
          lastText.text === message &&
          Date.now() - lastText.at < 8000
        ) {
          return m;
        }
        return [...m, { role, text: message, at: Date.now() }];
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
        // Red de seguridad visual: si David cita enlaces sin llamar a la tool,
        // mostramos las tarjetas igualmente.
        if (source === "ai") void showProducts(slugMatch);
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

  // En cuanto David habla, ya no hay espera.
  useEffect(() => {
    if (c.isSpeaking) setAwaitingReply(false);
  }, [c.isSpeaking]);

  // ── Música de espera ────────────────────────────────────────────
  // Suena mientras conecta o mientras David piensa (tras hablar/escribir el
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
      snoozeNudge(24 * 7); // ya ha entrado: la invitación sobra una temporada
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
    [c, fetchSignedUrl, snoozeNudge],
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

  // ── Enviar mensaje ESCRITO (misma sesión; David contesta con voz+texto) ──
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

  // ── Elegir producto tocando su tarjeta ──────────────────────────
  // Tocar la tarjeta = "este es el que quiero": se marca visualmente y se le
  // dice a David como mensaje de usuario para que siga directo con el precio,
  // sin obligar al cliente a describir el producto de palabra. La ficha se
  // abre aparte en popup (setFichaUrl) para no sacarle de la llamada.
  const selectProduct = useCallback(
    (it: ProductCard) => {
      setSelectedSlug(it.slug);
      setProductSlugsDiscussed((s) => {
        const n = new Set(s);
        n.add(it.slug);
        return n;
      });
      if (c.status !== "connected") return;
      const text = `He elegido «${it.name}» (${it.ref}). Dame precio de este.`;
      setMessages((m) => [...m, { role: "user", text, at: Date.now() }]);
      setAwaitingReply(true);
      try {
        c.sendUserMessage(text);
      } catch {
        /* sesión caída: el status lo reflejará */
      }
    },
    [c],
  );

  // ── Silenciar a David (para escribir con calma) ─────────────────
  // Mutea su VOZ (setVolume 0) y su ESCUCHA (setMuted) → chat de texto puro.
  // Reversible: reactiva ambos. No cierra la sesión.
  const toggleVoiceMute = useCallback(() => {
    setVoiceMuted((prev) => {
      const next = !prev;
      try {
        c.setVolume({ volume: next ? 0 : 1 });
      } catch {}
      try {
        c.setMuted?.(next);
      } catch {}
      return next;
    });
  }, [c]);

  // ── Activar la VOZ desde modo texto ─────────────────────────────
  // Si el micro se denegó (o el navegador no lo pidió), David cae a chat
  // escrito y antes no había vuelta atrás. Este botón cierra la sesión de
  // texto y reintenta con micro; si el navegador lo tiene bloqueado, el
  // reintento fallará y se queda en chat + mostramos una pista.
  const [voiceRetryFailed, setVoiceRetryFailed] = useState(false);
  const enableVoice = useCallback(async () => {
    setVoiceRetryFailed(false);
    // ¿Hay micro concedible? Sondeamos permiso antes de cerrar la sesión buena.
    let ok = false;
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      // Sin permiso: no rompemos la sesión de texto; guiamos al usuario.
      setVoiceRetryFailed(true);
      return;
    }
    userEndedRef.current = true;
    try {
      c.endSession();
    } catch {}
    setTimeout(() => void start({ keepMessages: true }), 300);
  }, [c, start]);

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
        // David se entera en silencio: que no vuelva a pedir los datos.
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
        // keepalive: que el POST sobreviva si el usuario cierra la pestaña.
        keepalive: true,
        body: JSON.stringify({
          voice_session_id: voiceSessionId,
          elevenlabs_conversation_id: c.getId?.() || null,
          duration_sec: durationSec,
          tools_called: toolsCalledRef.current,
          product_slugs_discussed: Array.from(productSlugsDiscussed),
          // Fallback para la notificación Telegram (la fuente canónica es la
          // API de ElevenLabs). Acotado: keepalive limita el body a 64 KB.
          // Las tarjetas de producto no son texto → fuera del transcript.
          transcript: messagesRef.current
            .filter(
              (m): m is Extract<Message, { role: "user" | "agent" }> =>
                m.role === "user" || m.role === "agent",
            )
            .slice(-200)
            .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) })),
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
  // envía a David como actualización contextual, no como mensaje del usuario.
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

  // Reaplicar el silencio de David tras una (re)conexión: la sesión nueva
  // arranca con volumen 1, así que si el cliente lo había silenciado hay que
  // volver a mutear para no romper la promesa "no hablará mientras escribo".
  useEffect(() => {
    if (c.status !== "connected" || !voiceMuted) return;
    try {
      c.setVolume({ volume: 0 });
    } catch {}
    try {
      c.setMuted?.(true);
    } catch {}
  }, [c.status, voiceMuted, c]);

  // Visualización de onda — David vivo.
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

  const mobileOwner = mobileFloatingOwner({
    pathname,
    cartCount: floatingCounts.cart,
    compareCount: floatingCounts.compare,
  });
  const launcherAllowed = isFloatingSurfaceAllowedOnPath(
    FLOATING_SURFACES.assistantLauncher,
    pathname,
  );
  const dialogOpen = open || isActive || isConnecting;
  const closeVoiceDialog = useCallback(() => {
    if (isActive || isConnecting) stop();
    setOpen(false);
  }, [isActive, isConnecting, stop]);
  const closeProductSheet = useCallback(() => setFichaUrl(null), []);

  useModelessDialogFocus({
    active: dialogOpen,
    containerRef: dialogRef,
    onEscape: closeVoiceDialog,
    suspended: fichaUrl !== null,
    restoreFallbackSelector: "[data-voice-agent-launcher]",
  });
  useModalFocus({
    active: fichaUrl !== null,
    containerRef: productSheetRef,
    onEscape: closeProductSheet,
  });

  return (
    <>
      {/* Burbuja de invitación (nudge) — explica qué es David e incita a abrir.
          Transparencia IA (AI Act art. 50): se presenta como asistente de IA. */}
      {launcherAllowed && nudge && !suppressAutomaticNudge && !open && !isActive && !isConnecting && (
        <div
          className="diego-nudge-motion fixed bottom-40 right-6 z-40 hidden w-64 rounded-2xl border border-line bg-white p-3.5 shadow-xl md:block"
        >
          <style>{`
            @keyframes diego-nudge-in {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .diego-nudge-motion { animation: diego-nudge-in 0.2s ease-out; }
            @media (prefers-reduced-motion: reduce) {
              .diego-nudge-motion { animation: none; }
            }
          `}</style>
          <button
            type="button"
            onClick={() => snoozeNudge(24)}
            aria-label="Cerrar invitación"
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-ink/40 hover:bg-bone-soft hover:text-ink"
          >
            ✕
          </button>
          <p className="pr-5 text-sm leading-snug text-ink">
            👋 ¿Precio al momento? Soy <b>{agentName}</b>, el asistente <b>IA</b> de la tienda.
          </p>
          <p className="mt-1 text-xs leading-snug text-ink/60">
            Pregúntame hablando o por escrito — te enseño opciones con foto y te preparo el
            presupuesto.
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              void start();
            }}
            className="mt-2.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep"
          >
            Probar ahora
          </button>
          {/* Flecha hacia el botón flotante */}
          <span
            aria-hidden
            className="absolute -bottom-1.5 right-10 h-3 w-3 rotate-45 border-b border-r border-line bg-white"
          />
        </div>
      )}

      {/* Botón flotante */}
      {launcherAllowed && !isActive && !isConnecting && (
        <button
          data-voice-agent-launcher
          data-floating-surface={FLOATING_SURFACES.assistantLauncher}
          type="button"
          onClick={() => {
            setOpen(true);
            void start();
          }}
          aria-label={`Hablar o escribir con ${agentName}, asistente virtual con IA`}
          aria-controls="voice-agent-dialog"
          aria-expanded={open}
          className={cn(
            "fixed bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] right-3 z-40 flex size-12 items-center justify-center rounded-full bg-ink text-bone shadow-lg hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:bottom-24 md:right-6 md:h-auto md:w-auto md:gap-2 md:px-4 md:py-3 md:text-sm md:font-semibold",
            mobileOwner !== FLOATING_SURFACES.assistantLauncher && "hidden md:flex",
          )}
        >
          <MicIcon className="size-5 md:size-4" />
          <span className="hidden md:inline">Habla o escribe a {agentName}</span>
          <span className="absolute -right-1 -top-1 rounded-full border border-bone bg-accent px-1.5 py-0.5 text-[8px] font-bold tracking-wider md:static md:border-0 md:bg-white/20 md:text-[9px]">
            IA
          </span>
        </button>
      )}

      {/* Panel conversación activa */}
      {dialogOpen && (
        <div
          ref={dialogRef}
          data-floating-surface={FLOATING_SURFACES.assistantDialog}
          id="voice-agent-dialog"
          role="dialog"
          aria-label={`${agentName}, asistente virtual con IA`}
          tabIndex={-1}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] left-3 right-3 z-50 max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1.5rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-white shadow-2xl md:bottom-6 md:left-auto md:right-6"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isActive
                    ? c.isSpeaking
                      ? "motion-safe:animate-pulse bg-accent"
                      : "bg-social"
                    : isConnecting
                      ? "motion-safe:animate-pulse bg-amber-400"
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
              onClick={closeVoiceDialog}
              data-modal-initial-focus
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

          {/* Transcripción. column-reverse = el navegador ancla el scroll al
              FONDO de forma nativa (patrón chat): el último mensaje y las
              tarjetas siempre visibles sin JS. El wrapper interior mantiene
              el orden normal de lectura. */}
          <div ref={transcriptRef} className="flex max-h-64 flex-col-reverse overflow-y-auto px-4 py-3">
            <div className="space-y-2">
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
                {agentName} es nuestro asistente virtual con IA: te ayuda a elegir producto, te da
                precio al momento y te prepara el presupuesto. Puedes hablarle o escribirle — si
                no das permiso de micro, seguirá por chat. Y si prefieres una persona, pídeselo y
                te llamamos.
              </p>
            )}
            {messages.map((m, i) =>
              m.role === "cart" ? (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl border border-social/40 bg-social/10 px-3 py-2"
                >
                  <p className="text-xs font-medium text-ink/85">🛒 Añadido: {m.text}</p>
                  <a
                    href="/carrito"
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-bone hover:bg-accent"
                  >
                    Ver carrito
                  </a>
                </div>
              ) : m.role === "products" ? (
                <div key={i} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {m.items.map((it) => {
                    const chosen = selectedSlug === it.slug;
                    return (
                      <div
                        key={it.slug}
                        role="button"
                        tabIndex={0}
                        aria-pressed={chosen}
                        onClick={() => selectProduct(it)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectProduct(it);
                          }
                        }}
                        className={`relative w-32 shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-white transition-colors ${
                          chosen ? "border-accent ring-2 ring-accent/50" : "border-line hover:border-accent"
                        }`}
                      >
                        {chosen && (
                          <span className="absolute right-1 top-1 z-10 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                            ✓ Elegido
                          </span>
                        )}
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- tarjeta efímera del chat; el proxy ya sirve tamaño razonable
                          <img
                            src={it.image}
                            alt={it.name}
                            loading="lazy"
                            className="h-24 w-full bg-bone-soft object-contain"
                          />
                        ) : (
                          <div className="h-24 w-full bg-bone-soft" />
                        )}
                        <div className="px-2 py-1.5">
                          <p className="truncate text-[11px] font-medium text-ink">{it.name}</p>
                          <p className="text-[10px] text-ink/50">{it.ref}</p>
                          {it.priceFromCents != null && (
                            <p className="text-[11px] font-semibold text-accent-deep">
                              desde {(it.priceFromCents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFichaUrl(it.url);
                            }}
                            className="mt-1 w-full rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-ink/70 hover:border-accent hover:text-accent"
                          >
                            Ver ficha
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "agent" ? "bg-bone-soft text-ink/85" : "bg-accent/10 text-ink/85 ml-6"
                  }`}
                >
                  {m.text}
                </div>
              ),
            )}
            </div>
          </div>

          {/* Formulario silencioso: por si prefiere que le contactemos.
              David NO lo anuncia; simplemente está ahí. */}
          {isActive && !leadHidden && (
            <div className="border-t border-line bg-bone-soft/70 px-4 py-2.5">
              {leadState === "sent" ? (
                <p className="text-xs font-medium text-social">
                  ✓ Datos recibidos — te contactamos muy pronto.
                </p>
              ) : leadCollapsed ? (
                <button
                  type="button"
                  onClick={() => setLeadCollapsed(false)}
                  className="text-[11px] text-ink/60 underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  📞 ¿Prefieres que te llamemos? Deja tus datos
                </button>
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
              {/* Modo VOZ: tecla clara para silenciar a David y escribir. */}
              {!textOnlyMode && (
                <button
                  type="button"
                  onClick={toggleVoiceMute}
                  aria-pressed={voiceMuted}
                  className={`mb-2 flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition ${
                    voiceMuted
                      ? "bg-accent text-white hover:bg-accent-deep"
                      : "bg-bone-soft text-ink/75 hover:bg-line"
                  }`}
                >
                  {voiceMuted ? (
                    <>
                      <SpeakerOffIcon className="h-4 w-4" /> Voz silenciada — toca para reactivarla
                    </>
                  ) : (
                    <>
                      <SpeakerOffIcon className="h-4 w-4" /> Silenciar a {agentName} y escribir
                    </>
                  )}
                </button>
              )}
              {/* Modo TEXTO (micro no concedido): tecla clara para pasar a voz. */}
              {textOnlyMode && (
                <>
                  <button
                    type="button"
                    onClick={enableVoice}
                    className="mb-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-bone transition hover:bg-accent"
                  >
                    <MicIcon className="h-4 w-4" /> Activar micrófono y hablar con {agentName}
                  </button>
                  {voiceRetryFailed && (
                    <p className="mb-2 rounded-lg bg-accent/10 px-3 py-2 text-[11px] leading-snug text-accent-deep">
                      El micrófono está bloqueado. {micUnblockHint()}
                    </p>
                  )}
                </>
              )}
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
                    // Señal de actividad: evita que David interrumpa mientras escribes.
                    try {
                      c.sendUserActivity();
                    } catch {}
                  }}
                  placeholder={textOnlyMode ? "Escribe tu mensaje…" : "…o escríbelo aquí"}
                  aria-label={`Escribir a ${agentName}`}
                  className="min-w-0 flex-1 rounded-full border border-line bg-bone-soft px-3.5 py-2 text-base sm:text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Enviar mensaje"
                  className="rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-bone hover:bg-accent disabled:opacity-40"
                >
                  Enviar
                </button>
              </form>
              <p className="mt-2 text-[10px] text-ink/45">
                Asistente con IA ·{" "}
                {textOnlyMode
                  ? "Modo chat (sin micrófono). Conversaciones anonimizadas."
                  : voiceMuted
                    ? `${agentName} no hablará ni te escuchará — escríbele con calma.`
                    : "Habla o escribe — como prefieras. Tu voz no se guarda."}
              </p>
            </footer>
          )}
        </div>
      )}
      {/* Ficha de producto en POPUP: iframe sobre la conversación. La llamada
          con David sigue viva debajo (el widget del iframe no se monta, ver
          guard inIframe). En móvil ocupa casi toda la pantalla, tipo sheet. */}
      {fichaUrl && (
        <div
          ref={productSheetRef}
          data-floating-surface={FLOATING_SURFACES.assistantSheet}
          role="dialog"
          aria-modal="true"
          aria-label="Ficha de producto recomendada por David"
          tabIndex={-1}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-[calc(0.75rem_+_env(safe-area-inset-top))] sm:items-center sm:p-6"
          onClick={closeProductSheet}
        >
          <div
            className="relative flex h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[85vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line bg-bone-soft/70 px-4 py-2">
              <p className="truncate text-xs font-medium text-ink/70">
                Ficha de producto — la conversación con David sigue activa
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={fichaUrl}
                  target="_blank"
                  rel="noopener"
                  className="rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink/70 hover:border-accent hover:text-accent"
                >
                  Abrir en pestaña
                </a>
                <button
                  type="button"
                  onClick={closeProductSheet}
                  data-modal-initial-focus
                  className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-bone hover:bg-accent"
                >
                  Cerrar ✕
                </button>
              </div>
            </div>
            <iframe src={fichaUrl} title="Ficha de producto" className="w-full flex-1" />
          </div>
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

function SpeakerOffIcon({ className }: { className?: string }) {
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
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
