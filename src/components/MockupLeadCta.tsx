"use client";

import { useState } from "react";

/**
 * Lead magnet de la home: "te montamos tu logo en el producto, gratis, en 4h".
 * Reutiliza el endpoint existente /api/mockup-request (Capa D del sistema de
 * mockup) → crea MockupRequest + email confirmación + alerta Telegram.
 */
export function MockupLeadCta() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStatus("sending");
    setErr("");
    try {
      const res = await fetch("/api/mockup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: "home-mockup-gratis",
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          brief: brief.trim() || null,
          sourceUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) setStatus("done");
      else {
        setStatus("error");
        setErr(d.error || `Error ${res.status}`);
      }
    } catch {
      setStatus("error");
      setErr("Error de red. Inténtalo de nuevo.");
    }
  }

  return (
    <section id="mockup-gratis" className="bg-ink text-bone">
      <div className="mx-auto grid max-w-8xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-20">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/50">— Mockup gratis</p>
          <h2 className="mt-3 font-display text-section font-semibold leading-tight text-bone">
            Mira tu logo en el producto.{" "}
            <span className="text-accent-light">Gratis, en 4 horas.</span>
          </h2>
          <p className="mt-4 max-w-md text-bone/70">
            Dinos qué necesitas y te montamos un <strong>mockup técnico real con tu logo</strong>
            —medidas exactas y técnica de marcaje recomendada— en menos de 4 h laborables. Sin
            compromiso.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-bone/70">
            {[
              "Producción en Centros Especiales de Empleo (Granada)",
              "Cotización cerrada en 24 h si te encaja",
              "Sin compromiso ni coste",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-accent-light">✓</span> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-3xl bg-bone p-6 text-ink lg:p-8">
          {status === "done" ? (
            <div className="py-6 text-center">
              <p className="font-display text-2xl font-semibold text-ink">¡Recibido! 🎉</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink/65">
                Te enviamos el mockup técnico a tu email en menos de 4 h laborables. Revisa la
                bandeja (y spam, por si acaso).
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm font-semibold text-ink">Pide tu mockup gratis</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre*"
                  required
                  className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email*"
                  required
                  className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Empresa (opcional)"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="¿Qué producto te interesa y para qué? (opcional)"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={status === "sending" || !name.trim() || !email.trim()}
                className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone transition hover:bg-accent-dark disabled:opacity-50"
              >
                {status === "sending" ? "Enviando…" : "Pedir mi mockup gratis →"}
              </button>
              {err && <p className="text-xs text-accent-deep">⚠ {err}</p>}
              <p className="text-[11px] leading-relaxed text-ink/45">
                Al enviar aceptas que te contactemos sobre tu petición. Sin spam.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
