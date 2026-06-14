"use client";

import { useState } from "react";

type Messages = { connectionNote: string; firstMessage: string; followUp: string };

function CopyBlock({ label, text, hint }: { label: string; text: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  }
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-ink/50">
          {label}
          {hint && <span className="ml-1 normal-case tracking-normal text-ink/35">· {hint}</span>}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-full bg-bone-soft px-2 py-0.5 text-[10px] hover:bg-line/30"
        >
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-1 whitespace-pre-wrap rounded border border-line bg-white px-2 py-1.5 text-[12px] leading-relaxed">
        {text}
      </p>
    </div>
  );
}

/**
 * Asistente de LinkedIn: la IA genera nota de conexión + primer mensaje +
 * seguimiento. NO automatiza nada (ToS LinkedIn) — el admin copia y pega
 * manualmente. Botón visible siempre (los leads de LinkedIn pueden no tener email).
 */
export function LinkedInMessageButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Messages | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);

  async function generate() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/outbound/${leadId}/linkedin-message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Error ${r.status}`);
        return;
      }
      setMessages(j.messages);
      setProfileUrl(j.linkedinUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : generate())}
        className="rounded-full bg-[#0a66c2]/10 px-3 py-1.5 text-xs text-[#0a66c2] hover:bg-[#0a66c2]/20"
      >
        {open ? "Cerrar LinkedIn" : "in Mensajes LinkedIn IA"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-bone p-3">
          {loading ? (
            <p className="text-xs text-ink/50">Generando con IA…</p>
          ) : messages ? (
            <>
              <CopyBlock label="Nota de conexión" hint={`${messages.connectionNote.length}/300`} text={messages.connectionNote} />
              <CopyBlock label="Primer mensaje (tras aceptar)" text={messages.firstMessage} />
              {messages.followUp && <CopyBlock label="Seguimiento (si no responde)" text={messages.followUp} />}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={generate}
                  className="rounded-full bg-bone-soft px-3 py-1.5 text-xs hover:bg-line/30"
                >
                  Regenerar
                </button>
                {profileUrl && (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-[#0a66c2] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Abrir perfil →
                  </a>
                )}
              </div>
              <p className="mt-2 text-[10px] text-ink/40">
                Copia y pega tú en LinkedIn (no se automatiza — cumple sus términos).
              </p>
            </>
          ) : null}
          {error && <p className="mt-2 text-xs text-accent">{error}</p>}
        </div>
      )}
    </div>
  );
}
