"use client";

import { useState } from "react";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/clientes/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError("Error de servidor");
      } else {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bone-soft p-8">
      <div className="w-full max-w-md rounded-3xl border border-line bg-bone p-8 lg:p-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Portal cliente</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Inicia sesión</h1>
        <p className="mt-2 text-sm text-ink/60">
          Te mandamos un enlace mágico al email. Sin contraseñas, sin registro: si tienes
          cotizaciones con nosotros, tendrás acceso.
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl bg-social/10 p-5">
            <p className="font-medium text-social">✓ Enlace enviado</p>
            <p className="mt-2 text-sm text-ink/70">
              Revisa tu email{" "}
              <strong>{email}</strong>. El enlace expira en 30 minutos. Si no llega, comprueba la
              carpeta de spam.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              required
              autoFocus
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            {error && <p className="rounded-lg bg-accent-wash p-2.5 text-xs text-accent-deep">⚠ {error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-bone hover:bg-accent disabled:opacity-40"
            >
              {busy ? "Enviando…" : "Enviarme el enlace"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-ink/40">
          Para crear primera cotización, vuelve al{" "}
          <a href="/catalogo" className="text-accent hover:underline">catálogo</a>.
        </p>
      </div>
    </main>
  );
}
