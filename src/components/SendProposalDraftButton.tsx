"use client";

import { useState } from "react";

/**
 * Botón de envío 1-clic para una propuesta BORRADOR generada por el agente
 * auto-proposal. POST a /api/admin/proposals/[id]/send-to-client.
 */
export function SendProposalDraftButton({
  proposalId,
  proposalNumber,
  email,
}: {
  proposalId: string;
  proposalNumber: string;
  email: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send() {
    if (!window.confirm(`¿Enviar la propuesta ${proposalNumber} a ${email}?`)) return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/send-to-client`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState("error");
        setMsg(data.error || `Error ${res.status}`);
        return;
      }
      setState("sent");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Error de red");
    }
  }

  if (state === "sent") {
    return <span className="text-xs font-semibold text-social">✓ Enviada</span>;
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === "sending"}
      className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-bone transition hover:bg-accent-deep disabled:opacity-60"
      title={state === "error" ? msg : `Enviar ${proposalNumber} al cliente`}
    >
      {state === "sending" ? "Enviando…" : state === "error" ? "Reintentar" : "Enviar al cliente →"}
    </button>
  );
}
