/**
 * /admin/insights/errors/[id] — detalle individual de un error.
 *
 * Panel tipo Sentry-lite: stack trace completo, metadata (URL, UA,
 * fecha), errores similares (misma firma de mensaje), y acciones
 * one-click para resolver, copiar firma o borrar.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { messageSignature } from "@/lib/insights/error-signature";
import { isPinned } from "@/lib/insights/pinned-errors";
import { ErrorDetailActions } from "./ErrorDetailActions";

export const metadata: Metadata = {
  title: "Detalle de error · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<string, string> = {
  error: "bg-rose-50 text-rose-700 border-rose-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

export default async function ErrorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const error = await prisma.errorEvent.findUnique({ where: { id } });
  if (!error) notFound();

  const pinned = await isPinned(error.id);

  // Buscar similares: mismo context + mismas primeras 80 chars normalizados
  const signature = messageSignature(error.message);
  const candidates = await prisma.errorEvent.findMany({
    where: {
      id: { not: error.id },
      context: error.context ?? undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 200, // filtramos en memoria
  });
  const similar = candidates.filter(
    (e) => messageSignature(e.message) === signature,
  );
  const totalOccurrences = similar.length + 1;
  const firstSeen = similar.length
    ? new Date(
        Math.min(
          ...similar.map((s) => s.createdAt.getTime()),
          error.createdAt.getTime(),
        ),
      )
    : error.createdAt;
  const lastSeen = similar.length
    ? new Date(
        Math.max(
          ...similar.map((s) => s.createdAt.getTime()),
          error.createdAt.getTime(),
        ),
      )
    : error.createdAt;

  const fmtDateTime = (d: Date) =>
    new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);

  return (
    <AdminChrome>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <Link href="/admin/insights/errors" className="hover:text-accent">
            Errores
          </Link>
          <span>/</span>
          <span className="font-mono">#{error.id.slice(0, 8)}</span>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  SEVERITY_STYLE[error.severity] ?? SEVERITY_STYLE.error
                }`}
              >
                {error.severity}
              </span>
              {error.resolved ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  ✓ Resuelto
                </span>
              ) : (
                <span className="rounded-full bg-bone-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/55">
                  ◯ Sin resolver
                </span>
              )}
              {error.context && (
                <span className="rounded-full bg-bone-soft px-2.5 py-0.5 font-mono text-[10px] text-ink/65">
                  {error.context}
                </span>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold text-ink lg:text-3xl">
              {error.message.length > 200
                ? error.message.slice(0, 200) + "…"
                : error.message}
            </h1>
            <p className="mt-2 text-sm text-ink/55">
              {totalOccurrences === 1
                ? "Primera y única ocurrencia"
                : `${totalOccurrences} ocurrencias agrupadas por firma`} · primer
              avistamiento {fmtDateTime(firstSeen)} · último{" "}
              {fmtDateTime(lastSeen)}
            </p>
          </div>
          <ErrorDetailActions
            errorId={error.id}
            resolved={error.resolved}
            signature={signature}
            pinned={pinned}
          />
        </div>

        {/* Stack trace */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Stack trace
          </h2>
          {error.stack ? (
            <pre className="mt-3 max-h-[480px] overflow-auto rounded-3xl border border-line bg-ink/95 p-5 font-mono text-[11px] leading-relaxed text-bone">
              {error.stack}
            </pre>
          ) : (
            <p className="mt-3 rounded-3xl border border-dashed border-line bg-bone-soft p-5 text-sm text-ink/55">
              No se capturó stack — error sin stack o capturado fuera del flujo
              normal de excepción.
            </p>
          )}
        </section>

        {/* Metadata */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Contexto de la sesión
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-bone p-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
                URL
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-ink">
                {error.url ?? "—"}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-bone p-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
                User-Agent
              </dt>
              <dd className="mt-1 break-all font-mono text-[10px] text-ink/80">
                {error.userAgent ?? "—"}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-bone p-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
                ID interno
              </dt>
              <dd className="mt-1 font-mono text-xs text-ink">{error.id}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-bone p-4">
              <dt className="text-[10px] font-medium uppercase tracking-wider text-ink/55">
                Firma agrupadora
              </dt>
              <dd className="mt-1 break-all font-mono text-[10px] text-ink/80">
                {signature}
              </dd>
            </div>
          </dl>
        </section>

        {/* Similar errors */}
        {similar.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-base font-semibold text-ink">
              Otras ocurrencias ({similar.length})
            </h2>
            <p className="mt-1 text-xs text-ink/55">
              Mismo context (<code>{error.context ?? "—"}</code>) y firma
              normalizada. Útil para detectar si el bug es esporádico o
              recurrente.
            </p>
            <ul className="mt-3 divide-y divide-line rounded-3xl border border-line bg-bone">
              {similar.slice(0, 30).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/insights/errors/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-bone-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-ink/85">
                        {s.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink/50">
                        {fmtDateTime(s.createdAt)} · {s.url ?? "sin URL"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        s.resolved
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-bone-soft text-ink/55"
                      }`}
                    >
                      {s.resolved ? "resuelto" : "abierto"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {similar.length > 30 && (
              <p className="mt-2 text-center text-xs text-ink/50">
                +{similar.length - 30} más no mostradas
              </p>
            )}
          </section>
        )}
      </div>
    </AdminChrome>
  );
}
