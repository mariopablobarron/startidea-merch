"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ErrorDetailActions({
  errorId,
  resolved,
  signature,
}: {
  errorId: string;
  resolved: boolean;
  signature: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
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
  );
}
