"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

export default function MagnificConfigPage() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrations/MAGNIFIC", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.config) {
        setEnabled(data.config.enabled ?? false);
        const cfg = data.config.config || {};
        setApiKey(cfg.apiKey || "");
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
      const res = await fetch("/api/admin/integrations/MAGNIFIC", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled, config: { apiKey: apiKey.trim() } }),
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
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/integrations/MAGNIFIC?action=test", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Test falló" });
      else setFeedback({ ok: true, msg: "✓ Conexión OK con Magnific" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Integraciones · Magnific
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Conectar Magnific
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            IA de imágenes para tu marketing: upscale fotos del catálogo, eliminar fondos,
            generar creatividades con Mystic, expandir formato para redes (1:1, 9:16, 16:9),
            cambiar iluminación. Pay-as-you-go, sin coste fijo.
          </p>
          <div className="mt-3 flex gap-3 text-xs">
            <Link href="/admin/integrations" className="text-ink/60 hover:text-accent">
              ← Integraciones
            </Link>
            <a
              href="https://www.magnific.com/developers/dashboard/api-key"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              Obtener API key Magnific ↗
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
              <p className="mt-1 text-[11px] text-ink/50 pl-7">
                Con esto desactivado, Asset Studio devuelve 503 y no se consume crédito.
              </p>
            </section>

            <section className="mt-4 space-y-4 rounded-2xl border border-line bg-bone p-5 lg:p-6">
              <h2 className="font-display text-base font-semibold text-ink">Credenciales</h2>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
                  API Key (x-magnific-api-key)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="FPSX..."
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-ink/50">
                  Obtenida en{" "}
                  <a
                    href="https://www.magnific.com/developers/dashboard/api-key"
                    target="_blank"
                    rel="noopener"
                    className="underline"
                  >
                    magnific.com/developers/dashboard/api-key
                  </a>
                </p>
              </div>

              <button
                type="button"
                onClick={test}
                disabled={testing || !apiKey}
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

            <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
              <h2 className="font-display text-base font-semibold text-ink">
                📚 Qué puedes hacer con Magnific
              </h2>
              <ul className="mt-3 space-y-1 text-xs text-ink/70">
                <li>
                  <strong>Upscale:</strong> fotos producto pixeladas → 2x/4x con detalle
                  añadido (creative upscaler).
                </li>
                <li>
                  <strong>Remove Background:</strong> fotos producto sobre cualquier fondo
                  → PNG transparente listo para web.
                </li>
                <li>
                  <strong>Mystic:</strong> generación ultra-realista para banners y
                  campañas (1K/2K/4K, varias aspect ratios).
                </li>
                <li>
                  <strong>Expand:</strong> extender imagen para formatos sociales (story
                  9:16 desde post 1:1).
                </li>
                <li>
                  <strong>Relight:</strong> cambiar iluminación de una foto producto sin
                  rehacer el shooting.
                </li>
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
