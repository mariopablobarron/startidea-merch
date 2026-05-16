"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
      } else {
        router.push("/admin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bone-soft p-8">
      <div className="w-full max-w-md rounded-3xl border border-line bg-bone p-8 lg:p-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Acceso panel</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Inicia sesión</h1>
        <p className="mt-2 text-sm text-ink/60">
          Solo personal autorizado de Startidea. Si no recuerdas tu contraseña, escribe
          a{" "}
          <a href="mailto:hola@startidea.es" className="text-accent underline-offset-2 hover:underline">
            hola@startidea.es
          </a>
          .
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@startidea.es"
            required
            autoFocus
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
            minLength={6}
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          {error && <p className="rounded-lg bg-accent-wash p-2.5 text-xs text-accent-deep">⚠ {error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
