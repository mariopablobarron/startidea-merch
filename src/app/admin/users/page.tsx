"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "CEO" | "COMERCIAL" | "FACTURACION" | "OPERACIONES";
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type LoginEvent = {
  id: string;
  email: string;
  method: string;
  ok: boolean;
  reason: string | null;
  ip: string | null;
  createdAt: string;
};

const ROLES: AdminUser["role"][] = ["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"];

const ROLE_LABEL: Record<AdminUser["role"], string> = {
  CEO: "CEO · todo",
  COMERCIAL: "Comercial · cotizaciones",
  FACTURACION: "Facturación · pagos e IVA",
  OPERACIONES: "Operaciones · pedidos y tracking",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  // form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("COMERCIAL");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [events, setEvents] = useState<LoginEvent[]>([]);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) setError(data.error || "Sin permiso (¿no eres CEO?)");
    else {
      setUsers(data.users || []);
      setError(null);
    }
  }

  useEffect(() => {
    load();
    // Auditoría de accesos (solo CEO; si falla, la sección queda vacía)
    fetch("/api/admin/auth/events")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvents(d?.events || []))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error");
      else {
        setCreated(`Usuario ${email} creado con rol ${role}.`);
        setEmail("");
        setName("");
        setPassword("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, data: Partial<AdminUser>) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    await load();
  }

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl font-semibold text-ink">Usuarios del panel</h1>
        <p className="mt-1 text-sm text-ink/60">
          Crea cuentas con rol específico. Solo el CEO puede gestionar usuarios.
        </p>

        {error && <p className="mt-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        {created && <p className="mt-4 rounded-lg bg-social/10 p-3 text-sm text-social">✓ {created}</p>}

        {/* Crear */}
        <form onSubmit={create} className="mt-6 rounded-3xl border border-line bg-bone p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Crear usuario</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@startidea.es"
              required
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo"
              required
              minLength={2}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña inicial (≥8 chars)"
              required
              minLength={8}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminUser["role"])}
              className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            {creating ? "Creando…" : "Crear usuario"}
          </button>
        </form>

        {/* Lista */}
        <section className="mt-8 overflow-hidden rounded-3xl border border-line bg-bone">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50">Usuario</th>
                <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50">Rol</th>
                <th className="px-4 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-ink/50">Último acceso</th>
                <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-ink/50">Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{u.name}</p>
                    <p className="text-xs text-ink/60">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => patch(u.id, { role: e.target.value as AdminUser["role"] })}
                      className="rounded-full border border-line bg-bone-soft px-2 py-1 text-[11px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-ink/60">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => patch(u.id, { active: !u.active })}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                        u.active
                          ? "bg-social/15 text-social hover:bg-social/25"
                          : "bg-bone-soft text-ink/50 hover:bg-line"
                      }`}
                    >
                      {u.active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {events.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink">Últimos accesos</h2>
            <p className="mt-1 text-sm text-ink/60">
              Auditoría de inicios de sesión (contraseña y Google), incluidos los rechazados.
            </p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-bone">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-bone-soft text-left text-[11px] uppercase tracking-wider text-ink/50">
                  <tr>
                    <th className="px-4 py-2.5">Cuándo</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Método</th>
                    <th className="px-4 py-2.5">Resultado</th>
                    <th className="px-4 py-2.5">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b border-line/60">
                      <td className="px-4 py-2.5 text-xs text-ink/60">
                        {new Date(ev.createdAt).toLocaleString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5">{ev.email}</td>
                      <td className="px-4 py-2.5 text-xs text-ink/60">
                        {ev.method === "google" ? "Google" : "Contraseña"}
                      </td>
                      <td className="px-4 py-2.5">
                        {ev.ok ? (
                          <span className="rounded-full bg-social/15 px-2 py-0.5 text-[11px] font-medium text-social">
                            ✓ entró
                          </span>
                        ) : (
                          <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[11px] font-medium text-accent-deep">
                            ✗ {ev.reason || "rechazado"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-ink/50">{ev.ip || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
