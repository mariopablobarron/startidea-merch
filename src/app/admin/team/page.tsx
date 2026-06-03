/**
 * /admin/team — gestión de AdminUser: listado + invitar + cambiar rol +
 * activar/desactivar. Solo accesible para CEO. Otros roles ven 404 (no
 * leak de info de equipo).
 *
 * Guardas a nivel API en /api/admin/team y /api/admin/team/[id]:
 *  - No puedes modificarte a ti mismo desde esta vista
 *  - El último CEO activo no se puede degradar ni desactivar
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { TeamClient } from "./TeamClient";

export const metadata: Metadata = {
  title: "Equipo · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

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

        <TeamClient
          initialUsers={users.map((u) => ({
            ...u,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            createdAt: u.createdAt.toISOString(),
          }))}
          currentUserId={session.userId}
        />
      </div>
    </AdminChrome>
  );
}
