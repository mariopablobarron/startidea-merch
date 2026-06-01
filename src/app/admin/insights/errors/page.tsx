/**
 * /admin/insights/errors — listado de errors capturados con CRUD.
 *
 * Muestra eventos de ErrorEvent con filtro resolved/unresolved + acciones
 * de marcar resuelto y eliminar. Si te pasa por encima de la cabeza,
 * "Borrar todos los resueltos" limpia de una vez.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { ErrorsClient } from "./ErrorsClient";

export const metadata: Metadata = {
  title: "Errores · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { filter: filterRaw } = await searchParams;
  const filter = filterRaw === "all" ? "all" : "unresolved";

  const [errors, unresolvedCount, totalCount] = await Promise.all([
    prisma.errorEvent.findMany({
      where: filter === "unresolved" ? { resolved: false } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.errorEvent.count({ where: { resolved: false } }),
    prisma.errorEvent.count(),
  ]);

  return (
    <AdminChrome>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <span>Errores</span>
        </nav>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              Errores capturados
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              {unresolvedCount} sin resolver · {totalCount} total · captura
              automática con GlobalErrorTracker + captureError() server-side.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/insights/errors?filter=unresolved"
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                filter === "unresolved" ? "bg-ink text-bone" : "bg-bone-soft text-ink/60 hover:bg-bone"
              }`}
            >
              Sin resolver
            </Link>
            <Link
              href="/admin/insights/errors?filter=all"
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                filter === "all" ? "bg-ink text-bone" : "bg-bone-soft text-ink/60 hover:bg-bone"
              }`}
            >
              Todos
            </Link>
          </div>
        </div>

        <ErrorsClient
          initialErrors={errors.map((e) => ({
            id: e.id,
            message: e.message,
            stack: e.stack,
            context: e.context,
            severity: e.severity,
            url: e.url,
            resolved: e.resolved,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </div>
    </AdminChrome>
  );
}
