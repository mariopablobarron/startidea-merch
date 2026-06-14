"use client";

import { useCallback, useEffect, useState } from "react";

type Review = {
  id: string;
  npsScore: number | null;
  comment: string | null;
  authorName: string | null;
  authorCompany: string | null;
  approved: boolean;
  isPublic: boolean;
  submittedAt: string | null;
  cart?: { name: string | null; company: string | null; email: string | null } | null;
};

type Stats = { total: number; promoters: number; detractors: number; npsScore: number | null };

type Filter = "pendientes" | "aprobadas" | "todas";

function scoreColor(n: number | null): string {
  if (n == null) return "bg-bone-soft text-ink/50";
  if (n >= 9) return "bg-social/20 text-social";
  if (n >= 7) return "bg-amber-100 text-amber-700";
  return "bg-accent-wash text-accent-deep";
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>("pendientes");
  const [secret, setSecret] = useState("");
  const [usingCookie, setUsingCookie] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (secret) headers["X-Admin-Secret"] = secret;
      const res = await fetch("/api/admin/reviews", { headers, credentials: "include" });
      const d = await res.json();
      if (res.ok) {
        setReviews(d.reviews || []);
        setStats(d.stats || null);
        if (secret) sessionStorage.setItem("merch:admin", secret);
        setUsingCookie(true);
      } else {
        setUsingCookie(false);
      }
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, data: { approved?: boolean; isPublic?: boolean }) {
    setBusyId(id);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["X-Admin-Secret"] = secret;
      const res = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ id, ...data }),
      });
      if (res.ok) {
        setReviews((rs) => rs.map((r) => (r.id === id ? { ...r, ...data } : r)));
      }
    } finally {
      setBusyId(null);
    }
  }

  // Solo reseñas enviadas (con texto/score). Las invitadas sin responder no se gestionan aquí.
  const submitted = reviews.filter((r) => r.submittedAt);
  const shown = submitted.filter((r) =>
    filter === "pendientes" ? !r.approved : filter === "aprobadas" ? r.approved : true,
  );
  const pendingCount = submitted.filter((r) => !r.approved).length;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Admin</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Reseñas</h1>
            <p className="mt-1 text-sm text-ink/60">
              Aprueba las reseñas que quieras mostrar en la home.
              {stats?.npsScore != null && (
                <> NPS global: <strong className="text-ink">{stats.npsScore}</strong> ({stats.total} respuestas).</>
              )}
            </p>
          </div>
          {!usingCookie && (
            <input
              type="password"
              placeholder="X-Admin-Secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-64 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
        </header>

        {/* Filtros */}
        <div className="mb-5 flex gap-2">
          {(["pendientes", "aprobadas", "todas"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${
                filter === f ? "bg-ink text-bone" : "border border-line bg-bone text-ink/70 hover:border-accent"
              }`}
            >
              {f}
              {f === "pendientes" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone p-10 text-center text-sm text-ink/60">
            {filter === "pendientes" ? "No hay reseñas pendientes de aprobar. 🎉" : "Nada por aquí."}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => {
              const author = r.authorName || r.cart?.name || "Anónimo";
              const company = r.authorCompany || r.cart?.company;
              return (
                <div key={r.id} className="rounded-2xl border border-line bg-bone p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${scoreColor(r.npsScore)}`}>
                          NPS {r.npsScore ?? "—"}
                        </span>
                        {r.approved && (
                          <span className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-social">
                            ✓ En la home
                          </span>
                        )}
                        {!r.isPublic && (
                          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/50">
                            oculta
                          </span>
                        )}
                      </div>
                      {r.comment && (
                        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/85">“{r.comment}”</p>
                      )}
                      <p className="mt-2 text-xs text-ink/55">
                        <strong className="text-ink/75">{author}</strong>
                        {company && ` · ${company}`}
                        {r.submittedAt && ` · ${new Date(r.submittedAt).toLocaleDateString("es-ES")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {r.approved ? (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => patch(r.id, { approved: false })}
                          className="rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs font-medium text-ink/70 hover:border-accent disabled:opacity-40"
                        >
                          Quitar de la home
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => patch(r.id, { approved: true })}
                          className="rounded-full bg-social px-4 py-1.5 text-xs font-semibold text-white hover:bg-social-dark disabled:opacity-40"
                        >
                          ✓ Aprobar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => patch(r.id, { isPublic: !r.isPublic })}
                        className="rounded-full px-4 py-1.5 text-[11px] text-ink/50 hover:text-accent disabled:opacity-40"
                      >
                        {r.isPublic ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
