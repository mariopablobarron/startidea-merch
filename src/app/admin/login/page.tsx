"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Mensajes legibles para los errores que devuelve el callback de Google
const GOOGLE_ERRORS: Record<string, string> = {
  no_autorizado:
    "Esa cuenta de Google no está autorizada en el panel. Pide acceso a hola@startidea.es.",
  google_state: "La sesión de Google caducó o no es válida. Vuelve a intentarlo.",
  google_nonce: "La sesión de Google caducó o no es válida. Vuelve a intentarlo.",
  google_token: "Google no completó el inicio de sesión. Vuelve a intentarlo.",
  google_verify: "No se pudo verificar la respuesta de Google. Vuelve a intentarlo.",
  google_email: "Tu cuenta de Google no tiene un email verificado.",
  google_no_config: "El login con Google no está configurado todavía.",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Errores que llegan del callback OAuth (?error=...). Leemos de
  // window.location en vez de useSearchParams para no necesitar Suspense.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setError(GOOGLE_ERRORS[err] || "No se pudo iniciar sesión con Google.");
  }, []);

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

        {/* Login con Google — solo entra si el email ya es AdminUser activo */}
        <div className="mt-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] uppercase tracking-wider text-ink/40">o</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <a
          href="/api/admin/auth/google/start"
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-bone-soft px-5 py-3 text-sm font-medium text-ink transition hover:border-accent/50 hover:bg-bone"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          Continuar con Google
        </a>
      </div>
    </main>
  );
}
