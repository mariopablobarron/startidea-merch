"use client";

import { useState } from "react";

/**
 * Botón de REENVÍO 1-clic para una propuesta YA enviada (sent/opened/accepted).
 * POST a /api/admin/proposals/[id]/resend — reenvía el mismo PDF al cliente sin
 * cambiar el estado. Para el primer envío de un borrador usar SendProposalDraftButton.
 */
export function ResendProposalButton({
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

  async function resend() {
    if (!window.confirm(`¿Reenviar la propuesta ${proposalNumber} a ${email}?`)) return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/resend`, {
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
    return <span className="text-xs font-semibold text-social">✓ Reenviada</span>;
  }

  return (
    <button
      type="button"
      onClick={resend}
      disabled={state === "sending"}
      className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition hover:bg-bone-soft disabled:opacity-60"
      title={state === "error" ? msg : `Reenviar ${proposalNumber} a ${email}`}
    >
      {state === "sending" ? "Reenviando…" : state === "error" ? "Reintentar" : "↻ Reenviar"}
    </button>
  );
}
