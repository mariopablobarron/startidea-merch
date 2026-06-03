"use client";

import { useState } from "react";

type TestResult =
  | { ok: true; elapsedMs: number; itemsSampled: number; message: string }
  | { ok: false; stage: string; message: string; elapsedMs?: number };

type DiagnoseResult = {
  ok: boolean;
  totalCount?: number;
  pctStock?: number;
  pctZeroStock?: number;
  pctPrice?: number;
  sample?: Array<{
    model: string;
    rootmodel: string;
    name: string;
    quantity: number;
    price_pvp: string;
  }>;
  message?: string;
};

type SyncResult =
  | {
      ok: true;
      status: "queued";
      message: string;
    }
  | {
      ok: false;
      status?: string;
      message: string;
      startedAt?: string;
    };

export function CifraClient({ tokenLoaded }: { tokenLoaded: boolean }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/cifra/test", {
        method: "POST",
      });
      setTestResult((await res.json()) as TestResult);
    } catch (err) {
      setTestResult({
        ok: false,
        stage: "network",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  async function runDiagnose() {
    setDiagnosing(true);
    setDiagnoseResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/cifra/diagnose", {
        method: "POST",
      });
      setDiagnoseResult((await res.json()) as DiagnoseResult);
    } catch (err) {
      setDiagnoseResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDiagnosing(false);
    }
  }

  async function runSyncNow() {
    if (!confirm("¿Disparar sync completo de Cifra ahora? Tarda ~2-5 min en background.")) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/cifra/sync-now", {
        method: "POST",
      });
      setSyncResult((await res.json()) as SyncResult);
    } catch (err) {
      setSyncResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      {/* Test conexión */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Prueba de conectividad
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          GET <code>/products/&lt;token&gt;/es</code> — valida que el token
          sigue activo y devuelve listado.
        </p>
        <button
          onClick={runTest}
          disabled={testing || !tokenLoaded}
          className="mt-3 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone hover:bg-accent-deep disabled:opacity-50"
        >
          {testing ? "Probando…" : "🩺 Probar conexión"}
        </button>
        {!tokenLoaded && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠️ El token no está en el VPS. Añádelo antes de probar.
          </p>
        )}
        {testResult && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              testResult.ok
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                testResult.ok ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {testResult.ok ? "✓ Conexión OK" : `✗ Error: ${testResult.stage}`}
            </p>
            <p className="mt-1 text-xs text-ink/75">{testResult.message}</p>
          </div>
        )}
      </section>

      {/* Diagnose stock */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Diagnóstico de stock y precios
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Descarga catálogo entero y reporta % con stock, % con precio, +
          muestra de 5. Útil para investigar el bug conocido de{" "}
          <strong>«Cifra reporta 0 variantes con stock»</strong> que aparece
          como sugerencia en el dashboard.
        </p>
        <button
          onClick={runDiagnose}
          disabled={diagnosing || !tokenLoaded}
          className="mt-3 rounded-full border border-line bg-bone-soft px-6 py-2.5 text-sm font-semibold text-ink hover:bg-bone disabled:opacity-50"
        >
          {diagnosing ? "Descargando catálogo…" : "🔬 Diagnosticar stock"}
        </button>

        {diagnoseResult && diagnoseResult.ok && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-bone p-4">
                <p className="text-[10px] uppercase text-ink/55">Total</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                  {diagnoseResult.totalCount?.toLocaleString("es-ES")}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-4 ${
                  (diagnoseResult.pctStock ?? 0) < 10
                    ? "border-rose-200 bg-rose-50/60"
                    : "border-emerald-200 bg-emerald-50/60"
                }`}
              >
                <p className="text-[10px] uppercase text-ink/55">Con stock</p>
                <p
                  className={`mt-1 font-mono text-2xl font-semibold ${
                    (diagnoseResult.pctStock ?? 0) < 10
                      ? "text-rose-800"
                      : "text-emerald-800"
                  }`}
                >
                  {diagnoseResult.pctStock}%
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-bone p-4">
                <p className="text-[10px] uppercase text-ink/55">Con precio</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                  {diagnoseResult.pctPrice}%
                </p>
              </div>
            </div>

            {(diagnoseResult.pctStock ?? 0) < 10 &&
              (diagnoseResult.totalCount ?? 0) > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
                  ⚠️ Confirmado: solo {diagnoseResult.pctStock}% de los productos
                  vienen con stock &gt; 0 desde Cifra. El problema está en el
                  proveedor o en cómo nos lo entregan, no en el parser.
                </div>
              )}

            {diagnoseResult.sample && diagnoseResult.sample.length > 0 && (
              <details className="rounded-2xl border border-line bg-bone p-4">
                <summary className="cursor-pointer text-xs font-medium text-ink/70">
                  Ver muestra (5 productos)
                </summary>
                <table className="mt-3 w-full text-xs">
                  <thead className="text-[10px] uppercase text-ink/55">
                    <tr>
                      <th className="text-left">Model</th>
                      <th className="text-left">Nombre</th>
                      <th className="text-right">Stock</th>
                      <th className="text-right">PVP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnoseResult.sample.map((p) => (
                      <tr key={p.model} className="border-t border-line/60">
                        <td className="py-1 font-mono text-[10px]">{p.model}</td>
                        <td className="truncate">{p.name}</td>
                        <td
                          className={`text-right font-mono ${
                            p.quantity === 0 ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {p.quantity}
                        </td>
                        <td className="text-right font-mono">{p.price_pvp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}

        {diagnoseResult && !diagnoseResult.ok && (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-800">
            ✗ {diagnoseResult.message}
          </p>
        )}
      </section>

      {/* Sync ahora */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Sincronizar catálogo
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Descarga el catálogo + stock + precios de Cifra y los vuelca a la BD.
          Tarda 2-5 min en background. El cron automático corre diario a las
          02:30 UTC; este botón es para forzar uno fuera de horario.
        </p>
        <button
          onClick={runSyncNow}
          disabled={syncing || !tokenLoaded}
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
            {!syncResult.ok && syncResult.startedAt && (
              <p className="mt-1 text-[11px] text-ink/55">
                Iniciado: {new Date(syncResult.startedAt).toLocaleString("es-ES")}
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
