"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ErrorRow = {
  id: string;
  message: string;
  stack: string | null;
  context: string | null;
  severity: string;
  url: string | null;
  resolved: boolean;
  createdAt: string;
};

const SEVERITY_COLOR: Record<string, string> = {
  error: "bg-accent-wash text-accent-deep",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-bone-soft text-ink/60",
};

function fmtDate(s: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
}

export function ErrorsClient({ initialErrors }: { initialErrors: ErrorRow[] }) {
  const router = useRouter();
  const [list, setList] = useState(initialErrors);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function toggleResolved(e: ErrorRow) {
    setList((l) =>
      l.map((it) => (it.id === e.id ? { ...it, resolved: !it.resolved } : it)),
    );
    await fetch("/api/admin/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, resolved: !e.resolved }),
    });
    startTransition(() => router.refresh());
  }

  async function deleteOne(id: string) {
    setList((l) => l.filter((it) => it.id !== id));
    await fetch(`/api/admin/errors?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    startTransition(() => router.refresh());
  }

  async function clearResolved() {
    if (!confirm("¿Borrar TODOS los errores marcados como resueltos? No se puede deshacer.")) return;
    await fetch("/api/admin/errors?all=resolved", { method: "DELETE" });
    setList((l) => l.filter((it) => !it.resolved));
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-8">
      {list.some((e) => e.resolved) && (
        <button
          onClick={clearResolved}
          disabled={busy}
          className="mb-4 rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs font-medium text-ink/60 hover:bg-accent-wash hover:text-accent-deep"
        >
          🗑 Borrar todos los resueltos
        </button>
      )}

      {list.length === 0 ? (
        <p className="rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/55">
          🎉 Sin errores. ¡A correr!
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => {
            const isExpanded = expanded === e.id;
            return (
              <li
                key={e.id}
                className={`rounded-3xl border p-4 ${
                  e.resolved
                    ? "border-line bg-bone-soft opacity-60"
                    : "border-line bg-bone"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          SEVERITY_COLOR[e.severity] ?? "bg-bone-soft text-ink/60"
                        }`}
                      >
                        {e.severity}
                      </span>
                      {e.context && (
                        <span className="rounded-full border border-line bg-bone-soft px-2 py-0.5 text-[10px] font-mono text-ink/70">
                          {e.context}
                        </span>
                      )}
                      <span className="text-[10px] text-ink/50">
                        {fmtDate(e.createdAt)}
                      </span>
                    </div>
                    <p className="break-words font-mono text-[12px] text-ink/85">
                      {e.message}
                    </p>
                    {e.url && (
                      <p className="mt-1 truncate text-[10px] text-ink/45">
                        {e.url}
                      </p>
                    )}
                    {isExpanded && e.stack && (
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-ink p-3 font-mono text-[10px] text-bone/80">
                        {e.stack}
                      </pre>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {e.stack && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : e.id)}
                        className="rounded-full bg-bone-soft px-3 py-1 text-[11px] text-ink/60 hover:bg-bone"
                      >
                        {isExpanded ? "Cerrar" : "Stack"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleResolved(e)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                        e.resolved
                          ? "bg-bone-soft text-ink/55 hover:bg-bone"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      }`}
                    >
                      {e.resolved ? "Reabrir" : "✓ Resuelto"}
                    </button>
                    <button
                      onClick={() => deleteOne(e.id)}
                      className="rounded-full px-3 py-1 text-[11px] text-ink/40 hover:bg-accent-wash hover:text-accent-deep"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
