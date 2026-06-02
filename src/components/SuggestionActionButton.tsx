"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  label: string;
  actionId: string;
  payload?: Record<string, unknown>;
  confirmText?: string;
};

export function SuggestionActionButton({
  label,
  actionId,
  payload,
  confirmText,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function run() {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/insights/apply-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, message: data.message || data.error || "Error" });
        return;
      }
      setStatus({ ok: true, message: data.message || "Hecho" });
      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      setBusy(false);
    }
  }

  if (status?.ok) {
    return (
      <span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
        ✓ {status.message}
      </span>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-bone transition hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Aplicando…" : label}
      </button>
      {status?.ok === false && (
        <p className="mt-1 text-xs text-accent-deep">{status.message}</p>
      )}
    </div>
  );
}
