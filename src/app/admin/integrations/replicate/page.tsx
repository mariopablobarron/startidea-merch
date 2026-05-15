"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

export default function ReplicateConfigPage() {
  const [enabled, setEnabled] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrations/REPLICATE", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.config) {
        setEnabled(data.config.enabled ?? false);
        const cfg = data.config.config || {};
        setApiToken(cfg.apiToken || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/integrations/REPLICATE", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled, config: { apiToken: apiToken.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else { setFeedback({ ok: true, msg: "Guardado" }); await load(); }
    } finally { setSaving(false); }
  }

  async function test() {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/integrations/REPLICATE?action=test", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Test falló" });
      else setFeedback({ ok: true, msg: `✓ Auth OK${data.data?.username ? ` (${data.data.username})` : ""}` });
    } finally { setTesting(false); }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Integraciones · Replicate
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Conectar Replicate
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            IA imágenes pay-per-use (real-esrgan upscaler, Flux generación,
            remove background). Coste ~$0,002-0,005 por imagen. Sin cuota fija.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Link href="/admin/integrations" className="text-ink/60 hover:text-accent">
              ← Integraciones
            </Link>
            <a
              href="https://replicate.com/account/api-tokens"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              Crear token Replicate ↗
            </a>
            <Link href="/admin/marketing/assets" className="text-accent hover:underline">
              Usar Asset Studio →
            </Link>
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
            </section>

            <section className="mt-4 space-y-4 rounded-2xl border border-line bg-bone p-5 lg:p-6">
              <h2 className="font-display text-base font-semibold text-ink">Credenciales</h2>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
                  API Token (Authorization Bearer)
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="r8_..."
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-ink/50">
                  Generar en{" "}
                  <a
                    href="https://replicate.com/account/api-tokens"
                    target="_blank"
                    rel="noopener"
                    className="underline"
                  >
                    replicate.com/account/api-tokens
                  </a>
                  . Requiere tarjeta vinculada para activar pay-per-use.
                </p>
              </div>

              <button
                type="button"
                onClick={test}
                disabled={testing || !apiToken}
                className="rounded-full border border-accent bg-accent/10 px-4 py-2 text-xs font-semibold text-accent-deep hover:bg-accent/20 disabled:opacity-40"
              >
                {testing ? "Probando…" : "🔌 Probar conexión"}
              </button>
            </section>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={load} className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent">
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

            <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
              <h2 className="font-display text-base font-semibold text-ink">
                💡 Modelos configurados
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-ink/70">
                <li>
                  <strong>🔍 Upscale</strong>: <code>philz1337x/clarity-upscaler</code>{" "}
                  — ~$0,005/imagen. Mejor calidad que real-esrgan estándar.
                </li>
                <li>
                  <strong>✨ Generación</strong>: <code>black-forest-labs/flux-schnell</code>{" "}
                  — ~$0,003/imagen. Más rápido del mercado, 4 pasos.
                </li>
                <li>
                  <strong>✂ Remove BG</strong>: <code>851-labs/background-remover</code>{" "}
                  — ~$0,005/imagen. PNG con alfa transparente, listo para web.
                </li>
              </ul>
              <p className="mt-3 text-[11px] text-ink/50">
                Replicate cobra por segundo de GPU. Los costes mostrados son
                orientativos según uso medio. Recarga saldo en{" "}
                <a
                  href="https://replicate.com/account/billing"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  replicate.com/account/billing
                </a>
                .
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
