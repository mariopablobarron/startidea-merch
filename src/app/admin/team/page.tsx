/**
 * /admin/team — listado de AdminUser para ver quién tiene acceso al
 * panel + último login. Read-only por ahora; CRUD (invitar / desactivar
 * / cambiar rol) en iter posterior.
 *
 * Solo accesible para CEO. Otros roles ven 404 (no leak de info).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Equipo · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  CEO: "CEO",
  COMERCIAL: "Comercial",
  FACTURACION: "Facturación",
  OPERACIONES: "Operaciones",
};

const ROLE_COLOR: Record<string, string> = {
  CEO: "bg-ink text-bone",
  COMERCIAL: "bg-accent-wash text-accent-deep",
  FACTURACION: "bg-amber-100 text-amber-800",
  OPERACIONES: "bg-emerald-100 text-emerald-800",
};

function fmtDate(d: Date | null): string {
  if (!d) return "nunca";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function daysAgo(d: Date | null): string {
  if (!d) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

export default async function AdminTeamPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const session = await getAdminSession();
  // Solo CEO ve esta página; el resto recibe 404 para no leak de roles.
  if (session?.role !== "CEO") notFound();

  const users = await prisma.adminUser.findMany({
    orderBy: [{ active: "desc" }, { lastLoginAt: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const activeCount = users.filter((u) => u.active).length;
  const recentLoginsCount = users.filter(
    (u) =>
      u.lastLoginAt &&
      Date.now() - u.lastLoginAt.getTime() < 7 * 86_400_000,
  ).length;

  return (
    <AdminChrome>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <span>Equipo</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">Equipo admin</h1>
        <p className="mt-1 text-sm text-ink/60">
          {users.length} cuentas · {activeCount} activas · {recentLoginsCount}{" "}
          con login en los últimos 7 días
        </p>

        <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-bone">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-bone-soft text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-ink/70">Nombre</th>
                <th className="px-4 py-3 font-medium text-ink/70">Email</th>
                <th className="px-4 py-3 font-medium text-ink/70">Rol</th>
                <th className="px-4 py-3 font-medium text-ink/70">Último login</th>
                <th className="px-4 py-3 font-medium text-ink/70">Creada</th>
                <th className="px-4 py-3 font-medium text-ink/70">Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink/75">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        ROLE_COLOR[u.role] ?? "bg-bone-soft text-ink/60"
                      }`}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink/80">{daysAgo(u.lastLoginAt)}</p>
                    <p className="text-[10px] text-ink/45">
                      {fmtDate(u.lastLoginAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/55">
                    {fmtDate(u.createdAt)}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] text-ink/45">
          Read-only por ahora. Para invitar / desactivar / cambiar rol, edita
          la tabla <code>AdminUser</code> directamente en BD o pide CRUD admin
          en próxima iter.
        </p>
      </div>
    </AdminChrome>
  );
}
