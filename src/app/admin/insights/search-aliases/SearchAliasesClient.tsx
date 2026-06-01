"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type AliasRow = {
  id: string;
  query: string;
  redirectTo: string;
  description: string | null;
  active: boolean;
  hitCount: number;
};

export function SearchAliasesClient({ initialAliases }: { initialAliases: AliasRow[] }) {
  const router = useRouter();
  const [list, setList] = useState(initialAliases);
  const [query, setQuery] = useState("");
  const [redirectTo, setRedirectTo] = useState("");
  const [description, setDescription] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!query.trim() || !redirectTo.trim()) return;
    const res = await fetch("/api/admin/search-aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.trim(),
        redirectTo: redirectTo.trim(),
        description: description.trim() || null,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Error al guardar");
      return;
    }
    const { alias } = await res.json();
    setList((l) => {
      const filtered = l.filter((it) => it.query !== alias.queryLower);
      return [
        {
          id: alias.id,
          query: alias.queryLower,
          redirectTo: alias.redirectTo,
          description: alias.description,
          active: alias.active,
          hitCount: alias.hitCount,
        },
        ...filtered,
      ];
    });
    setQuery("");
    setRedirectTo("");
    setDescription("");
    startTransition(() => router.refresh());
  }

  async function onDelete(id: string) {
    setList((l) => l.filter((it) => it.id !== id));
    await fetch(`/api/admin/search-aliases?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={onAdd} className="rounded-3xl border border-line bg-bone p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Crear o actualizar alias</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Query (lo que busca el cliente)</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              placeholder="teletrabajo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mt-1 w-full rounded-full border border-line bg-bone-soft px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink/70">Redirigir a (URL relativa)</span>
            <input
              type="text"
              required
              maxLength={300}
              placeholder="/catalogo?q=mochila+termo"
              value={redirectTo}
              onChange={(e) => setRedirectTo(e.target.value)}
              className="mt-1 w-full rounded-full border border-line bg-bone-soft px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-ink/70">Descripción (opcional)</span>
          <input
            type="text"
            maxLength={300}
            placeholder="Cuando buscan productos para trabajo en casa"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-full border border-line bg-bone-soft px-4 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        {error && <p className="mt-2 text-xs text-accent-deep">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bone transition hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar alias"}
        </button>
      </form>

      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Alias activos ({list.length})
        </h2>
        {list.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-bone-soft p-6 text-center text-sm text-ink/55">
            Aún no hay aliases. Crea uno arriba para empezar.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-bone">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line bg-bone-soft text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-ink/70">Query</th>
                  <th className="px-4 py-3 font-medium text-ink/70">Redirige a</th>
                  <th className="px-4 py-3 font-medium text-ink/70">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-ink/70">Hits</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="px-4 py-3 font-mono text-xs text-ink/85">{a.query}</td>
                    <td className="px-4 py-3 font-mono text-xs text-accent">{a.redirectTo}</td>
                    <td className="px-4 py-3 text-xs text-ink/60">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-ink/70">{a.hitCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onDelete(a.id)}
                        className="rounded-full bg-bone-soft px-3 py-1 text-xs text-ink/60 hover:bg-accent-wash hover:text-accent-deep"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
