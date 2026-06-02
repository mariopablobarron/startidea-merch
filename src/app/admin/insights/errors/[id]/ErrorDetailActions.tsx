"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ErrorDetailActions({
  errorId,
  resolved,
  signature,
  pinned,
}: {
  errorId: string;
  resolved: boolean;
  signature: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [pinNote, setPinNote] = useState("");
  const [showPinForm, setShowPinForm] = useState(false);

  async function setResolved(next: boolean) {
    await fetch(`/api/admin/errors`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: errorId, resolved: next }),
    });
    startTransition(() => router.refresh());
  }

  async function remove() {
    if (!confirm("¿Borrar este error de la BD? Las ocurrencias similares no se tocan."))
      return;
    await fetch(`/api/admin/errors?id=${encodeURIComponent(errorId)}`, {
      method: "DELETE",
    });
    router.push("/admin/insights/errors");
  }

  async function copySig() {
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function pin() {
    await fetch(`/api/admin/errors/${errorId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: pinNote.trim() || undefined }),
    });
    setShowPinForm(false);
    setPinNote("");
    startTransition(() => router.refresh());
  }

  async function unpin() {
    await fetch(`/api/admin/errors/${errorId}/pin`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setResolved(!resolved)}
          disabled={busy}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
            resolved
              ? "border border-line bg-bone-soft text-ink/70 hover:bg-bone"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {resolved ? "↺ Reabrir" : "✓ Marcar resuelto"}
        </button>
        {!resolved &&
          (pinned ? (
            <button
              onClick={unpin}
              disabled={busy}
              className="rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-50"
              title="Quitar de sugerencias"
            >
              📌 Pinneado · des-pinnear
            </button>
          ) : (
            <button
              onClick={() => setShowPinForm((v) => !v)}
              disabled={busy}
              className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              title="Convertir en sugerencia visible en el dashboard"
            >
              📌 Convertir en sugerencia
            </button>
          ))}
        <button
          onClick={copySig}
          className="rounded-full border border-ink/20 bg-bone-soft px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-bone"
        >
          {copied ? "✓ Copiada" : "📋 Copiar firma"}
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          🗑 Borrar
        </button>
      </div>

      {showPinForm && !pinned && !resolved && (
        <div className="w-full max-w-xs rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <label className="block text-[10px] font-medium uppercase tracking-wider text-amber-900">
            Nota interna (opcional)
          </label>
          <textarea
            value={pinNote}
            onChange={(e) => setPinNote(e.target.value)}
            placeholder='Ej: «aparece al checkout, prioritario para sprint»'
            maxLength={280}
            rows={3}
            className="mt-1 w-full rounded-lg border border-amber-200 bg-bone px-2 py-1.5 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowPinForm(false);
                setPinNote("");
              }}
              className="rounded-full px-3 py-1 text-[11px] text-ink/55 hover:text-ink"
            >
              Cancelar
            </button>
            <button
              onClick={pin}
              disabled={busy}
              className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Pinnear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
