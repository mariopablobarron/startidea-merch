"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  email: string;
  name: string;
  role: "CEO" | "COMERCIAL" | "FACTURACION" | "OPERACIONES";
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  CEO: "CEO",
  COMERCIAL: "Comercial",
  FACTURACION: "Facturación",
  OPERACIONES: "Operaciones",
};

const ROLES = ["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"] as const;

function fmtDate(s: string | null): string {
  if (!s) return "nunca";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
}

function daysAgo(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

export function TeamClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Form crear
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>("COMERCIAL");
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Error al crear");
        return;
      }
      setUsers((u) => [data.user, ...u]);
      setCreatedPassword({ email: data.user.email, password: data.tempPassword });
      setNewEmail("");
      setNewName("");
      setNewRole("COMERCIAL");
      setShowCreate(false);
      startTransition(() => router.refresh());
    } finally {
      setCreating(false);
    }
  }

  async function patch(
    id: string,
    body: { role?: User["role"]; active?: boolean },
  ) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/team/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Error");
        return;
      }
      setUsers((list) => list.map((u) => (u.id === id ? data.user : u)));
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {/* Crear form */}
      <section className="mt-6">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bone hover:bg-accent"
          >
            ＋ Invitar admin
          </button>
        ) : (
          <form
            onSubmit={create}
            className="rounded-3xl border border-line bg-bone p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
              Invitar nuevo admin
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                type="email"
                placeholder="email@startidea.es"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nombre"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                maxLength={80}
                className="rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as (typeof ROLES)[number])}
                className="rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[11px] text-ink/55">
              Se autogenerará una password temporal de 16 chars que verás UNA
              vez aquí — guárdala antes de cerrar.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-bone hover:bg-accent-deep disabled:opacity-50"
              >
                {creating ? "Creando…" : "Crear cuenta"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                className="rounded-full border border-line bg-bone-soft px-5 py-2 text-xs text-ink/70 hover:bg-bone"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>

      {createdPassword && (
        <div className="mt-4 rounded-3xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="font-display text-sm font-semibold text-emerald-900">
            ✅ Cuenta creada — guarda esta password ahora
          </p>
          <p className="mt-2 text-sm text-emerald-900/85">
            Email: <code className="font-mono">{createdPassword.email}</code>
          </p>
          <p className="mt-1 text-sm text-emerald-900/85">
            Password temporal:{" "}
            <code className="rounded bg-emerald-100 px-2 py-1 font-mono text-base font-bold tracking-wider text-emerald-900">
              {createdPassword.password}
            </code>
          </p>
          <p className="mt-3 text-[11px] text-emerald-900/70">
            Compártela por canal seguro (Signal, llamada, en persona). Al
            cerrar este bloque NO la volverás a ver.
          </p>
          <button
            onClick={() => setCreatedPassword(null)}
            className="mt-3 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            Ya la he guardado, cerrar
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
          ⚠ {error}
        </p>
      )}

      {/* Tabla */}
      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-bone">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-bone-soft text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-ink/70">Nombre</th>
              <th className="px-4 py-3 font-medium text-ink/70">Email</th>
              <th className="px-4 py-3 font-medium text-ink/70">Rol</th>
              <th className="px-4 py-3 font-medium text-ink/70">Último login</th>
              <th className="px-4 py-3 font-medium text-ink/70">Estado</th>
              <th className="px-4 py-3 font-medium text-ink/70">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">
                    {u.name}
                    {isSelf && (
                      <span className="ml-2 text-[10px] text-ink/45">(tú)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/75">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-ink/70">
                        {ROLE_LABEL[u.role]}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          patch(u.id, {
                            role: e.target.value as User["role"],
                          })
                        }
                        disabled={busy}
                        className="rounded-full border border-line bg-bone-soft px-2 py-0.5 text-[11px] focus:border-accent focus:outline-none disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink/80">{daysAgo(u.lastLoginAt)}</p>
                    <p className="text-[10px] text-ink/45">
                      {fmtDate(u.lastLoginAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        ✓ activa
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-bone-soft px-2 py-0.5 text-[10px] font-semibold text-ink/55">
                        inactiva
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-[11px] text-ink/45">—</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (
                            u.active &&
                            !confirm(
                              `Desactivar a ${u.name}? No podrá hacer login.`,
                            )
                          )
                            return;
                          patch(u.id, { active: !u.active });
                        }}
                        disabled={busy}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${
                          u.active
                            ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {busy ? "…" : u.active ? "Desactivar" : "Reactivar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] text-ink/45">
        No puedes modificarte a ti mismo desde aquí — usa /admin/cuenta para
        cambiar tu propia contraseña. El último CEO activo no se puede
        degradar ni desactivar.
      </p>
    </>
  );
}
