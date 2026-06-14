"use client";

import { useState } from "react";

/**
 * Botón de email frío IA para un lead outbound. Flujo: genera borrador con IA
 * (preview) → el admin lo revisa/edita → envía. El pie legal LSSI + link de
 * baja se añaden en el servidor (no editables). Solo se muestra si hay email.
 */
export function OutboundEmailButton({ leadId, hasEmail }: { leadId: string; hasEmail: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function preview() {
    setOpen(true);
    setLoading(true);
    setError("");
    setSent(false);
    try {
      const r = await fetch(`/api/admin/outbound/${leadId}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Error ${r.status}`);
        return;
      }
      setSubject(j.draft.subject);
      setBody(j.draft.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!window.confirm("¿Enviar este email frío al lead? Incluirá el pie legal y el link de baja.")) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/outbound/${leadId}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { subject, body } }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.error || `Error ${r.status}`);
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (!hasEmail) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : preview())}
        className="rounded-full bg-bone-soft px-3 py-1.5 text-xs hover:bg-line/30"
      >
        {open ? "Cerrar email" : "✉️ Email IA"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-line bg-bone p-3 text-xs">
          {loading && !subject ? (
            <p className="text-ink/50">Generando con IA…</p>
          ) : sent ? (
            <p className="font-semibold text-social">✓ Email enviado al lead.</p>
          ) : (
            <>
              <label className="block text-[10px] uppercase tracking-wide text-ink/50">Asunto</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mb-2 w-full rounded border border-line bg-white px-2 py-1"
              />
              <label className="block text-[10px] uppercase tracking-wide text-ink/50">Cuerpo</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                className="w-full rounded border border-line bg-white px-2 py-1 font-mono leading-relaxed"
              />
              <p className="mt-1 text-[10px] text-ink/40">
                Se añadirá automáticamente el pie legal (Startidea Málaga SL · CIF · dirección) y el link de baja.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !subject || !body}
                  className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-40"
                >
                  {loading ? "Enviando…" : "Enviar al lead →"}
                </button>
                <button
                  type="button"
                  onClick={preview}
                  disabled={loading}
                  className="rounded-full bg-bone-soft px-3 py-1.5 hover:bg-line/30"
                >
                  Regenerar
                </button>
              </div>
            </>
          )}
          {error && <p className="mt-2 text-accent">{error}</p>}
        </div>
      )}
    </div>
  );
}
