"use client";

import { useState } from "react";

export function ReviewForm({
  token,
  defaultName,
  defaultCompany,
}: {
  token: string;
  defaultName: string;
  defaultCompany: string;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(defaultName);
  const [company, setCompany] = useState(defaultCompany);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (score == null) {
      setError("Elige una puntuación.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npsScore: score, comment, authorName: name, authorCompany: company, isPublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al enviar.");
      } else {
        setDone(true);
        setTimeout(() => location.reload(), 800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="mt-6 text-center text-sm text-social">✓ Gracias.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      <div>
        <p className="text-sm font-medium text-ink">
          Sobre 10, ¿cuánto recomendarías TodoMerchandising a otra empresa?
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }).map((_, n) => {
            const active = score === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                className={`h-10 w-10 rounded-xl border text-sm font-semibold tabular-nums transition ${
                  active
                    ? n >= 9
                      ? "border-social bg-social text-bone"
                      : n >= 7
                        ? "border-accent bg-accent text-bone"
                        : "border-ink bg-ink text-bone"
                    : "border-line bg-bone-soft text-ink hover:border-accent"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] uppercase tracking-wider text-ink/50">
          <span>Nada probable</span>
          <span>Súper probable</span>
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-ink">Comentario (opcional)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={1500}
          placeholder="Ej: Plazo cumplido al día, mockup muy claro, calidad superior a la esperada…"
          className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          maxLength={120}
          className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Empresa (opcional)"
          maxLength={160}
          className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/70">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        <span>
          Permito que mi reseña aparezca pública en la web (mostraremos sólo nombre + empresa).
        </span>
      </label>

      {error && <p className="text-xs text-accent-deep">⚠ {error}</p>}

      <button
        type="submit"
        disabled={busy || score == null}
        className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bone hover:bg-accent disabled:opacity-40"
      >
        {busy ? "Enviando…" : "Enviar valoración"}
      </button>
    </form>
  );
}
