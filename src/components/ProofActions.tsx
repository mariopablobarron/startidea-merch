"use client";

import { useState } from "react";

type Mode = "menu" | "approve" | "reject" | "revision" | "done";

export function ProofActions({ token, clientEmail }: { token: string; clientEmail: string }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState("");
  const [artworkUrl, setArtworkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string } | null>(null);

  async function send(action: "approve" | "reject" | "revision", payload: Record<string, unknown> = {}) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/proof/${token}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, decidedBy: clientEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al enviar la decisión.");
        return;
      }
      setDone({ status: data.status });
      setMode("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "done" && done) {
    return (
      <div className="rounded-2xl bg-social/10 p-6 text-center">
        <p className="font-display text-xl font-semibold text-ink">
          ✓ Decisión registrada
        </p>
        <p className="mt-2 text-sm text-ink/70">
          {done.status === "APPROVED" && "Hemos recibido tu aprobación. Pasamos producción a marcha."}
          {done.status === "REJECTED" && "Hemos recibido el rechazo. Te respondemos con propuesta corregida."}
          {done.status === "REVISION" && "Hemos recibido el artwork nuevo. Te enviaremos un mockup actualizado."}
        </p>
      </div>
    );
  }

  if (mode === "menu") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => send("approve")}
          disabled={submitting}
          className="rounded-full bg-social px-5 py-3 text-sm font-medium text-bone transition hover:bg-social-dark disabled:opacity-40"
        >
          ✓ Aprobar
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="rounded-full border border-line bg-bone-soft px-5 py-3 text-sm font-medium text-ink hover:border-accent"
        >
          ✗ Rechazar
        </button>
        <button
          type="button"
          onClick={() => setMode("revision")}
          className="rounded-full border border-line bg-bone-soft px-5 py-3 text-sm font-medium text-ink hover:border-accent"
        >
          ↻ Subir artwork
        </button>
        {error && <p className="col-span-full text-xs text-accent-deep">⚠ {error}</p>}
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div>
        <p className="text-sm font-medium text-ink">¿Qué hay que cambiar?</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          minLength={10}
          maxLength={1000}
          placeholder="Ej: el logo está demasiado pequeño, prefiero el azul corporativo en vez del negro…"
          className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("menu")}
            className="rounded-full border border-line bg-bone px-4 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => send("reject", { reason })}
            disabled={submitting || reason.trim().length < 10}
            className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-bone disabled:opacity-40"
          >
            {submitting ? "Enviando…" : "Enviar rechazo"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-accent-deep">⚠ {error}</p>}
      </div>
    );
  }

  if (mode === "revision") {
    return (
      <div>
        <p className="text-sm font-medium text-ink">URL del artwork actualizado</p>
        <p className="mt-1 text-xs text-ink/60">
          Sube tu archivo a Drive/Dropbox/WeTransfer y pega aquí el enlace público.
        </p>
        <input
          value={artworkUrl}
          onChange={(e) => setArtworkUrl(e.target.value)}
          placeholder="https://…"
          className="mt-3 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("menu")}
            className="rounded-full border border-line bg-bone px-4 py-2 text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => send("revision", { artworkUrl })}
            disabled={submitting || !/^https?:\/\//.test(artworkUrl)}
            className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-bone disabled:opacity-40"
          >
            {submitting ? "Enviando…" : "Enviar artwork"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-accent-deep">⚠ {error}</p>}
      </div>
    );
  }

  return null;
}
