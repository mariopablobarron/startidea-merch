"use client";

import { useEffect, useState } from "react";

type RunLog = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  response: string | null;
  error: string | null;
  triggeredBy: string;
};

type CronRow = {
  name: string;
  endpointPath: string;
  method: "GET" | "POST";
  schedule: string;
  scheduleCron: string;
  frequencyHours: number;
  description: string;
  status: "OK" | "STALE" | "NEVER" | "RUNNING" | "FAILED";
  last: RunLog | null;
  lastRuns: RunLog[];
};

const STATUS_STYLES: Record<CronRow["status"], string> = {
  OK: "bg-social/15 text-social",
  STALE: "bg-accent-mist text-accent-deep",
  NEVER: "bg-line/30 text-ink/55",
  RUNNING: "bg-blue-100 text-blue-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<CronRow["status"], string> = {
  OK: "OK",
  STALE: "Atrasado",
  NEVER: "Nunca corrió",
  RUNNING: "En curso",
  FAILED: "Falló",
};

export default function CronsAdminPage() {
  const [crons, setCrons] = useState<CronRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [triggering, setTriggering] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ name: string; ok: boolean; msg: string } | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/crons", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setCrons(data.crons || []);
        setGeneratedAt(data.generatedAt);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function trigger(name: string) {
    if (triggering) return;
    if (!confirm(`¿Lanzar el cron "${name}" ahora?`)) return;
    setTriggering(name);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/crons/trigger/${name}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setFeedback({
        name,
        ok: !!data.ok,
        msg: data.ok
          ? `OK · HTTP ${data.httpStatus} · ${data.durationMs}ms · ${
              typeof data.body === "string" ? data.body : JSON.stringify(data.body).slice(0, 200)
            }`
          : `FAIL · HTTP ${data.httpStatus || "—"} · ${data.error || JSON.stringify(data.body || {})}`,
      });
      load(); // refresca tabla
    } catch (err) {
      setFeedback({ name, ok: false, msg: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Sistema</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Crons</h1>
      <p className="mt-2 text-sm text-ink/65">
        Los crons se disparan desde el VPS (cron de Linux, no cron-job.org). Aquí ves
        cada cuándo deberían correr, qué pasó la última vez, y puedes lanzarlos manualmente.
        Si un cron está atrasado o falló, te llega alerta Telegram (
        <code>@Merchandisingstartideabot</code>) — y queda registrado aquí.
      </p>
      <p className="mt-1 text-[11px] text-ink/45">
        Última actualización: {generatedAt ? new Date(generatedAt).toLocaleString("es-ES") : "—"}{" "}
        ·{" "}
        <button onClick={load} className="underline-offset-2 hover:underline">
          recargar
        </button>
      </p>

      {feedback && (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            feedback.ok ? "bg-social/10 text-social" : "bg-red-50 text-red-700"
          }`}
        >
          <p className="font-semibold">
            {feedback.ok ? "✓" : "⚠"} {feedback.name}
          </p>
          <p className="mt-0.5 text-xs whitespace-pre-wrap">{feedback.msg}</p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando…</p>
        ) : (
          <ul className="divide-y divide-line">
            {crons.map((c) => {
              const isOpen = openHistory === c.name;
              return (
                <li key={c.name} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[c.status]}`}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                        <p className="font-display text-base font-semibold text-ink">{c.name}</p>
                        <code className="text-[11px] text-ink/55">{c.endpointPath}</code>
                      </div>
                      <p className="mt-1 text-sm text-ink/70">{c.description}</p>
                      <p className="mt-1 text-[12px] text-ink/55">
                        <span className="font-medium">Frecuencia:</span> {c.schedule}
                        {c.scheduleCron !== "—" && (
                          <code className="ml-2 rounded bg-bone-soft px-1.5 py-0.5 text-[10px]">
                            {c.scheduleCron}
                          </code>
                        )}
                      </p>
                      {c.last && (
                        <p className="mt-2 text-[12px] text-ink/65">
                          <span className="font-medium">Último run:</span>{" "}
                          {new Date(c.last.startedAt).toLocaleString("es-ES")} ·{" "}
                          {c.last.ok ? (
                            <span className="text-social">OK</span>
                          ) : (
                            <span className="text-red-600">FAIL</span>
                          )}
                          {c.last.httpStatus ? ` · HTTP ${c.last.httpStatus}` : ""}
                          {c.last.durationMs != null ? ` · ${c.last.durationMs}ms` : ""}
                          {" · "}
                          <span className="text-ink/50">{c.last.triggeredBy}</span>
                        </p>
                      )}
                      {c.last?.response && (
                        <details className="mt-1 text-[11px]">
                          <summary className="cursor-pointer text-ink/55 hover:text-ink/80">
                            ver respuesta
                          </summary>
                          <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-bone-soft p-2 text-[11px] text-ink/75 whitespace-pre-wrap">
                            {c.last.response}
                          </pre>
                        </details>
                      )}
                      {c.last?.error && (
                        <p className="mt-1 text-[11px] text-red-600">
                          Error: <code>{c.last.error}</code>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => trigger(c.name)}
                        disabled={triggering === c.name}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                      >
                        {triggering === c.name ? "Lanzando…" : "Lanzar ahora →"}
                      </button>
                      {c.lastRuns.length > 1 && (
                        <button
                          onClick={() => setOpenHistory(isOpen ? null : c.name)}
                          className="text-[11px] text-ink/55 hover:text-ink/80"
                        >
                          {isOpen ? "ocultar histórico" : `histórico (${c.lastRuns.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && c.lastRuns.length > 0 && (
                    <ul className="mt-4 space-y-1 rounded-xl bg-bone-soft p-3 text-[11px] text-ink/70">
                      {c.lastRuns.map((r) => (
                        <li key={r.id} className="flex items-center gap-2">
                          <span className={r.ok ? "text-social" : "text-red-600"}>
                            {r.ok ? "✓" : "✗"}
                          </span>
                          <span>{new Date(r.startedAt).toLocaleString("es-ES")}</span>
                          {r.httpStatus && <span>HTTP {r.httpStatus}</span>}
                          {r.durationMs != null && <span>· {r.durationMs}ms</span>}
                          <span className="text-ink/45">· {r.triggeredBy}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
