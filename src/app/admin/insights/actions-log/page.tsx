/**
 * /admin/insights/actions-log
 *
 * Histórico de acciones one-click aplicadas desde el dashboard.
 * Útil para auditoría ("¿cuándo desactivé esa promoción?") y para
 * detectar patrones (acciones más usadas).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Histórico acciones · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  deactivate_expired_promotions: "Desactivar promociones expiradas",
  open_create_alias: "Crear alias búsqueda",
  clear_resolved_errors: "Limpiar errores resueltos",
  snooze_suggestion: "Snooze sugerencia",
  unsnooze_all: "Cancelar todos los snoozes",
};

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function ActionsLogPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [logs, snoozedCount, total] = await Promise.all([
    prisma.suggestionActionLog.findMany({
      orderBy: { appliedAt: "desc" },
      take: 100,
    }),
    prisma.suggestionSnooze.count({
      where: { snoozedUntil: { gt: new Date() } },
    }),
    prisma.suggestionActionLog.count(),
  ]);

  return (
    <AdminChrome>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">Panel</Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">Insights</Link>
          <span>/</span>
          <span>Histórico acciones</span>
        </nav>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              Histórico de acciones
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              {total} acciones aplicadas · {snoozedCount} sugerencia{snoozedCount === 1 ? "" : "s"} en snooze ahora mismo.
            </p>
          </div>
          {snoozedCount > 0 && (
            <form action="/api/admin/insights/apply-suggestion" method="POST">
              {/* Esto es enlace estilo formulario — funciona con POST plain */}
            </form>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="mt-8 rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/55">
            Aún no se ha aplicado ninguna acción. Cuando le des a un botón «Aplicar» en el dashboard, aparecerá aquí.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-bone">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b border-line bg-bone-soft text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-ink/70">Cuándo</th>
                  <th className="px-4 py-3 font-medium text-ink/70">Acción</th>
                  <th className="px-4 py-3 font-medium text-ink/70">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const result = l.result as { message?: string } | null;
                  const payload = l.payload as Record<string, unknown> | null;
                  return (
                    <tr key={l.id} className="border-b border-line/60">
                      <td className="px-4 py-3 text-xs text-ink/55">{fmtDate(l.appliedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">
                          {ACTION_LABEL[l.actionId] ?? l.actionId}
                        </div>
                        {payload && Object.keys(payload).length > 0 && (
                          <div className="mt-0.5 font-mono text-[10px] text-ink/45">
                            {JSON.stringify(payload).slice(0, 80)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink/75">{result?.message ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminChrome>
  );
}
