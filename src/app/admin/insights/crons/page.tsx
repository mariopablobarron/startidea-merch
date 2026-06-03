/**
 * /admin/insights/crons — historial de ejecuciones de cada cron.
 *
 * Solo cubre crons que pasen por wrapCronHandler de lib/cron-tracking.
 * Si no aparece nada → ese cron no está integrado aún o no se ha
 * ejecutado todavía.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { listCronNames, getCronHistory } from "@/lib/cron-tracking";

export const metadata: Metadata = {
  title: "Crons · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function fmtAbsolute(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function CronsPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const names = await listCronNames();
  const histories = await Promise.all(
    names.map(async (name) => ({ name, runs: await getCronHistory(name) })),
  );

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
          <span>Crons</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Historial de crons
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Últimas 20 ejecuciones de cada cron que pasa por{" "}
          <code>wrapCronHandler</code>. Si un cron debería estar aquí y no
          aparece, no se está ejecutando o no está integrado.
        </p>

        {histories.length === 0 ? (
          <p className="mt-8 rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/55">
            Aún sin ejecuciones registradas. Cuando un cron se dispare,
            aparecerá aquí.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {histories.map(({ name, runs }) => {
              const lastOk = runs.find((r) => r.ok);
              const lastFail = runs.find((r) => !r.ok);
              const totalFails = runs.filter((r) => !r.ok).length;
              const successRate =
                runs.length > 0
                  ? Math.round(((runs.length - totalFails) / runs.length) * 100)
                  : 0;
              return (
                <section
                  key={name}
                  className="rounded-3xl border border-line bg-bone p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-ink">
                      {name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          successRate >= 90
                            ? "bg-emerald-50 text-emerald-800"
                            : successRate >= 50
                              ? "bg-amber-50 text-amber-800"
                              : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {successRate}% éxito
                      </span>
                      <span className="text-ink/55">
                        {runs.length} runs
                      </span>
                      {totalFails > 0 && (
                        <span className="text-rose-700">
                          {totalFails} fallos
                        </span>
                      )}
                      {lastOk && (
                        <span className="text-emerald-700">
                          Último OK: {fmtRelative(lastOk.at)}
                        </span>
                      )}
                      {lastFail && (
                        <span className="text-rose-700">
                          Último fallo: {fmtRelative(lastFail.at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-xs">
                      <thead className="text-[10px] uppercase text-ink/55">
                        <tr>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-right">Duración</th>
                          <th className="px-3 py-2 text-right">Status</th>
                          <th className="px-3 py-2 text-left">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.slice(0, 10).map((r, i) => (
                          <tr
                            key={`${r.at}-${i}`}
                            className="border-t border-line/60"
                          >
                            <td className="px-3 py-2 text-ink/85">
                              <span className="font-mono">
                                {fmtAbsolute(r.at)}
                              </span>
                              <span className="ml-2 text-[10px] text-ink/45">
                                ({fmtRelative(r.at)})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {r.elapsedMs} ms
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {r.status}
                            </td>
                            <td className="px-3 py-2">
                              {r.ok ? (
                                <span className="text-emerald-700">✓ OK</span>
                              ) : (
                                <span className="text-rose-700">
                                  ✗ {r.error?.slice(0, 80) ?? "fallo"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AdminChrome>
  );
}
