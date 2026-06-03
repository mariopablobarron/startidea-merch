"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TestResult =
  | { ok: true; elapsedMs: number; message: string }
  | { ok: false; stage: string; message: string; elapsedMs?: number };

type SyncResult =
  | { ok: true; status: "queued"; message: string }
  | { ok: false; status?: string; message: string; startedAt?: string };

export function MidoceanClient({
  initialLive,
  initialSource,
  initialFromBd,
  initialFromEnv,
  apiKeyLoaded,
}: {
  initialLive: boolean;
  initialSource: string;
  initialFromBd: boolean | null;
  initialFromEnv: boolean;
  apiKeyLoaded: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState(initialLive);
  const [source, setSource] = useState(initialSource);
  const [switching, setSwitching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [, startTransition] = useTransition();

  async function runSyncNow() {
    if (!confirm("¿Disparar sync completo de MidOcean ahora? Tarda ~5-15 min en background.")) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/midocean/sync-now", { method: "POST" });
      setSyncResult((await res.json()) as SyncResult);
    } catch (err) {
      setSyncResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncing(false);
    }
  }

  async function toggleLive(next: boolean) {
    if (next === live) return;
    if (next) {
      const ok = confirm(
        "ATENCIÓN: en modo live, los pedidos que confirmes en la web se enviarán REALMENTE a MidOcean (con coste real). ¿Continuar?",
      );
      if (!ok) return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/admin/suppliers/midocean/live-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setLive(data.active);
        setSource(data.source);
        startTransition(() => router.refresh());
      }
    } finally {
      setSwitching(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/midocean/test", {
        method: "POST",
      });
      const data = (await res.json()) as TestResult;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        stage: "network",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      {/* Toggle live orders */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Modo de pedidos
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Cuando <strong>live</strong>, los POST a <code>/orders</code> se
          envían realmente a MidOcean. Cuando <strong>simulación</strong>, se
          guarda el payload localmente con <code>dryRun:true</code> y NO se
          contacta al proveedor. Cambio sin redeploy.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => toggleLive(false)}
            disabled={switching}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              !live
                ? "bg-ink text-bone"
                : "border border-line bg-bone hover:bg-bone-soft"
            }`}
          >
            🧪 Simulación
          </button>
          <button
            onClick={() => toggleLive(true)}
            disabled={switching}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              live
                ? "bg-rose-600 text-white"
                : "border border-line bg-bone hover:bg-bone-soft"
            }`}
          >
            🔴 Live (pedidos reales)
          </button>
          <span className="text-xs text-ink/55">
            Activo: <strong>{live ? "live" : "simulación"}</strong> · fuente:{" "}
            <code>{source}</code>
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-[11px] text-ink/55 sm:grid-cols-2">
          <p>
            En BD (<code>AdminSetting.midocean_live_orders</code>):{" "}
            <strong>
              {initialFromBd === null ? "no definido" : String(initialFromBd)}
            </strong>
          </p>
          <p>
            En env (<code>MIDOCEAN_LIVE_ORDERS</code>):{" "}
            <strong>{String(initialFromEnv)}</strong>
          </p>
        </div>
      </section>

      {/* Test conexión */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Prueba de conectividad
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          GET <code>/gateway/stock/2.0</code> — endpoint barato para validar
          que el API Key sigue siendo válido sin descargar el catálogo entero.
        </p>
        <button
          onClick={runTest}
          disabled={testing || !apiKeyLoaded}
          className="mt-3 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone hover:bg-accent-deep disabled:opacity-50"
        >
          {testing ? "Probando…" : "🩺 Probar conexión"}
        </button>
        {!apiKeyLoaded && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠️ El API Key no está en el VPS. Añádelo al <code>.env</code>{" "}
            antes de probar.
          </p>
        )}

        {result && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              result.ok
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                result.ok ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {result.ok
                ? "✓ Conexión OK"
                : `✗ Error en stage: ${result.stage}`}
            </p>
            <p className="mt-1 text-xs text-ink/75">{result.message}</p>
          </div>
        )}
      </section>

      {/* Sync ahora */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Sincronizar catálogo
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Descarga productos + stock + precios de MidOcean y los vuelca a la BD.
          Tarda 5-15 min en background. El cron automático corre diario a las
          01:30 UTC.
        </p>
        <button
          onClick={runSyncNow}
          disabled={syncing || !apiKeyLoaded}
          className="mt-3 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {syncing ? "Encolando…" : "🔄 Sync ahora"}
        </button>
        {syncResult && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              syncResult.ok
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                syncResult.ok ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {syncResult.ok
                ? "✓ Sync iniciado"
                : syncResult.status === "in_progress"
                  ? "⏳ Sync ya en curso"
                  : "✗ Error"}
            </p>
            <p className="mt-1 text-xs text-ink/75">{syncResult.message}</p>
          </div>
        )}
      </section>
    </>
  );
}
