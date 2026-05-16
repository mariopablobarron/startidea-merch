"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Account = { network: string; id: number };

const NETWORKS = [
  { id: "IG", label: "Instagram" },
  { id: "FB", label: "Facebook" },
  { id: "LINKEDIN", label: "LinkedIn" },
  { id: "X", label: "X / Twitter" },
  { id: "TIKTOK", label: "TikTok" },
  { id: "YOUTUBE", label: "YouTube" },
  { id: "PINTEREST", label: "Pinterest" },
  { id: "THREADS", label: "Threads" },
  { id: "GMB", label: "Google Business Profile" },
];

export default function MetricoolConfigPage() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [blogId, setBlogId] = useState("");
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testResult, setTestResult] = useState<{ brands?: Array<{ id: number; label: string }> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrations/METRICOOL", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.config) {
        setEnabled(data.config.enabled ?? false);
        const cfg = data.config.config || {};
        setApiKey(cfg.apiKey || "");
        setUserId(cfg.userId ? String(cfg.userId) : "");
        setBlogId(cfg.blogId ? String(cfg.blogId) : "");
        const a: Record<string, string> = {};
        if (cfg.accounts && typeof cfg.accounts === "object") {
          for (const [k, v] of Object.entries(cfg.accounts)) {
            a[k] = String(v);
          }
        }
        setAccounts(a);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const config: Record<string, unknown> = {
        apiKey: apiKey.trim(),
        userId: userId ? parseInt(userId, 10) : null,
        blogId: blogId ? parseInt(blogId, 10) : null,
        accounts: Object.fromEntries(
          Object.entries(accounts)
            .filter(([, v]) => v && v.trim())
            .map(([k, v]) => [k, parseInt(v, 10)]),
        ),
      };

      const res = await fetch("/api/admin/integrations/METRICOOL", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled, config }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado" });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/integrations/METRICOOL?action=test", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Test falló" });
      } else {
        setTestResult(data.data || null);
        setFeedback({ ok: true, msg: "Conexión OK con Metricool" });
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Integraciones · Metricool
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Conectar Metricool
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Programa y publica tus piezas en IG, FB, LinkedIn, X, TikTok, YouTube,
            Pinterest, Threads y Google Business automáticamente cuando llega su
            <code className="mx-1 rounded bg-bone-soft px-1 py-0.5 font-mono">scheduledAt</code>.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Link href="/admin/integrations" className="text-ink/60 hover:text-accent">
              ← Integraciones
            </Link>
            <a
              href="https://app.metricool.com/api"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              Obtener API key Metricool ↗
            </a>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : (
          <>
            <section className="rounded-2xl border border-line bg-bone p-5 lg:p-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 accent-social"
                />
                <span className="text-sm font-medium text-ink">
                  Activar integración (master switch)
                </span>
              </label>
              <p className="mt-1 text-[11px] text-ink/50 pl-7">
                Con esto desactivado, el cron de publicación deja de procesar
                piezas SCHEDULED a redes sociales (las marca FAILED).
              </p>
            </section>

            <section className="mt-4 space-y-4 rounded-2xl border border-line bg-bone p-5 lg:p-6">
              <h2 className="font-display text-base font-semibold text-ink">
                Credenciales
              </h2>

              <Field
                label="API Key (X-Mc-Auth)"
                help="Obtenida en https://app.metricool.com/api → Connect to your data"
              >
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="mc_xxxxxxxxxxxxxxxx"
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="User ID" help="ID numérico de tu usuario Metricool">
                  <input
                    type="number"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field
                  label="Blog ID"
                  help="ID de la marca (TodoMerchandising) en Metricool"
                >
                  <input
                    type="number"
                    value={blogId}
                    onChange={(e) => setBlogId(e.target.value)}
                    placeholder="789012"
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={test}
                disabled={testing || !apiKey || !userId}
                className="rounded-full border border-accent bg-accent/10 px-4 py-2 text-xs font-semibold text-accent-deep hover:bg-accent/20 disabled:opacity-40"
              >
                {testing ? "Probando…" : "🔌 Probar conexión"}
              </button>

              {testResult?.brands && testResult.brands.length > 0 && (
                <div className="rounded-xl border border-social/30 bg-social/5 p-3 text-xs">
                  <p className="font-medium text-social">
                    ✓ {testResult.brands.length} marcas encontradas:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {testResult.brands.map((b) => (
                      <li key={b.id} className="text-ink/70">
                        <span className="font-mono">{b.id}</span> · {b.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-ink/50">
                    Copia el ID de la marca correcta arriba en &quot;Blog ID&quot;.
                  </p>
                </div>
              )}
            </section>

            <section className="mt-4 space-y-3 rounded-2xl border border-line bg-bone p-5 lg:p-6">
              <h2 className="font-display text-base font-semibold text-ink">
                IDs de cuentas por red social
              </h2>
              <p className="text-xs text-ink/60">
                Cada red social conectada en Metricool tiene su propio ID numérico.
                Lo encuentras en Metricool → Tu marca → cada cuenta. Solo rellena
                las redes que quieras usar (las vacías se ignoran).
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {NETWORKS.map((n) => (
                  <Field key={n.id} label={n.label}>
                    <input
                      type="number"
                      value={accounts[n.id] || ""}
                      onChange={(e) =>
                        setAccounts({ ...accounts, [n.id]: e.target.value })
                      }
                      placeholder="ID numérico"
                      className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                    />
                  </Field>
                ))}
              </div>
            </section>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
              <button
                type="button"
                onClick={load}
                className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
              >
                Descartar
              </button>
            </div>

            {feedback && (
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
                }`}
              >
                {feedback.ok ? "✓" : "⚠"} {feedback.msg}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}
