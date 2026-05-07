"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Session = {
  userId: string;
  email: string;
  name: string;
  role: "CEO" | "COMERCIAL" | "FACTURACION" | "OPERACIONES";
};

const ROLE_LABEL: Record<Session["role"], string> = {
  CEO: "CEO · acceso total",
  COMERCIAL: "Comercial · cotizaciones y propuestas",
  FACTURACION: "Facturación · pagos e IVA",
  OPERACIONES: "Operaciones · pedidos y tracking",
};

export default function MiCuentaPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setSession(d.session);
      })
      .finally(() => setLoadingSession(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (newPassword !== confirmPassword) {
      setFeedback({ ok: false, msg: "Las contraseñas nuevas no coinciden" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          ok: false,
          msg: data.error || `Error (${res.status})`,
        });
      } else {
        setFeedback({
          ok: true,
          msg: "Contraseña actualizada. Úsala la próxima vez que inicies sesión.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Admin</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Mi cuenta</h1>
          <Link
            href="/admin"
            className="mt-2 inline-block text-xs text-ink/60 hover:text-accent"
          >
            ← Volver al panel
          </Link>
        </header>

        {loadingSession ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : !session ? (
          <p className="rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">
            ⚠ No hay sesión activa. <Link href="/admin/login" className="underline">Inicia sesión</Link>.
          </p>
        ) : (
          <>
            <section className="mb-8 rounded-2xl border border-line bg-bone p-6">
              <p className="text-xs uppercase tracking-wider text-ink/50">Tu sesión</p>
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="text-ink/60">Nombre:</span>{" "}
                  <span className="font-medium text-ink">{session.name}</span>
                </p>
                <p>
                  <span className="text-ink/60">Email:</span>{" "}
                  <span className="font-mono text-ink">{session.email}</span>
                </p>
                <p>
                  <span className="text-ink/60">Rol:</span>{" "}
                  <span className="font-medium text-accent">{ROLE_LABEL[session.role]}</span>
                </p>
              </div>
              {session.userId === "legacy-admin" && (
                <p className="mt-3 rounded-lg bg-accent-wash p-3 text-xs text-accent-deep">
                  ⚠ Esta sesión usa X-Admin-Secret legacy y no tiene cuenta asociada.
                  Para cambiar contraseña necesitas iniciar sesión con email/contraseña.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-bone p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Cambiar contraseña</h2>
              <p className="mt-1 text-xs text-ink/60">
                Mínimo 10 caracteres con mayúscula, minúscula y número. La nueva contraseña entra
                en vigor en tu próximo inicio de sesión.
              </p>

              <form onSubmit={onSubmit} className="mt-5 space-y-3" autoComplete="off">
                <div>
                  <label
                    htmlFor="current"
                    className="text-xs font-medium uppercase tracking-wider text-ink/60"
                  >
                    Contraseña actual
                  </label>
                  <input
                    id="current"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new"
                    className="text-xs font-medium uppercase tracking-wider text-ink/60"
                  >
                    Nueva contraseña
                  </label>
                  <input
                    id="new"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="text-xs font-medium uppercase tracking-wider text-ink/60"
                  >
                    Repite la nueva contraseña
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || session.userId === "legacy-admin"}
                  className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
                >
                  {submitting ? "Guardando…" : "Cambiar contraseña"}
                </button>

                {feedback && (
                  <p
                    className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                      feedback.ok
                        ? "bg-social/10 text-social"
                        : "bg-accent-wash text-accent-deep"
                    }`}
                  >
                    {feedback.ok ? "✓" : "⚠"} {feedback.msg}
                  </p>
                )}
              </form>
            </section>

            {session.role === "CEO" && (
              <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-6">
                <h2 className="font-display text-lg font-semibold text-ink">
                  Gestionar usuarios del equipo
                </h2>
                <p className="mt-1 text-xs text-ink/60">
                  Solo CEO. Crea, edita roles y resetea contraseñas de otras cuentas admin.
                </p>
                <Link
                  href="/admin/users"
                  className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark"
                >
                  Ir a Usuarios →
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
