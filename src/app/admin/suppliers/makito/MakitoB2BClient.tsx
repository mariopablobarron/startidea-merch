"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TestResult =
  | {
      ok: true;
      mode: string;
      elapsedMs: number;
      countries: number;
      sample: unknown;
      message: string;
    }
  | {
      ok: false;
      mode: string;
      stage: string;
      message: string;
      elapsedMs?: number;
    };

export function MakitoB2BClient({
  initialMode,
  sandboxLoaded,
  productionLoaded,
}: {
  initialMode: "sandbox" | "production";
  sandboxLoaded: boolean;
  productionLoaded: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [switchingTo, setSwitchingTo] = useState<"sandbox" | "production" | null>(null);
  const [, startTransition] = useTransition();

  async function changeMode(next: "sandbox" | "production") {
    if (next === mode) return;
    if (next === "production") {
      const ok = confirm(
        "ATENCIÓN: en modo producción los pedidos creados desde la web se procesan REALMENTE en Makito. ¿Continuar?",
      );
      if (!ok) return;
    }
    setSwitchingTo(next);
    try {
      const res = await fetch("/api/admin/suppliers/makito/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const data = await res.json();
      if (data.ok) {
        setMode(next);
        setResult(null);
        startTransition(() => router.refresh());
      }
    } finally {
      setSwitchingTo(null);
    }
  }

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/suppliers/makito/test-b2b", {
        method: "POST",
      });
      const data = (await res.json()) as TestResult;
      setResult(data);
      startTransition(() => router.refresh());
    } catch (err) {
      setResult({
        ok: false,
        mode,
        stage: "network",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  const activeCredsLoaded = mode === "sandbox" ? sandboxLoaded : productionLoaded;

  return (
    <>
      {/* Selector de modo */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Modo activo
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Cambiar entre sandbox y producción no requiere redeploy. El cambio se
          guarda en la BD (key <code>makito_b2b_mode</code>) y aplica al siguiente request.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => changeMode("sandbox")}
            disabled={!sandboxLoaded || switchingTo !== null}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              mode === "sandbox"
                ? "bg-ink text-bone"
                : "border border-line bg-bone hover:bg-bone-soft"
            }`}
          >
            {switchingTo === "sandbox" ? "Cambiando…" : "🧪 Sandbox"}
          </button>
          <button
            onClick={() => changeMode("production")}
            disabled={!productionLoaded || switchingTo !== null}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              mode === "production"
                ? "bg-rose-600 text-white"
                : "border border-line bg-bone hover:bg-bone-soft"
            }`}
          >
            {switchingTo === "production" ? "Cambiando…" : "🔴 Producción"}
          </button>
          <span className="self-center text-xs text-ink/55">
            Activo: <strong>{mode}</strong>
          </span>
        </div>
      </section>

      {/* Botón test */}
      <section className="mt-8">
        <h2 className="font-display text-base font-semibold text-ink">
          Prueba de conectividad
        </h2>
        <p className="mt-1 text-xs text-ink/55">
          Hace login → recibe JWT → llama <code>/orders/countries</code>. Si
          devuelve países, el cliente está vivo.
        </p>
        <button
          onClick={runTest}
          disabled={testing || !activeCredsLoaded}
          className="mt-3 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone hover:bg-accent-deep disabled:opacity-50"
        >
          {testing ? "Probando…" : "🩺 Probar conexión"}
        </button>
        {!activeCredsLoaded && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠️ Las credenciales para modo <strong>{mode}</strong> no están en
            el VPS. Añádelas al <code>.env</code> antes de probar.
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
              {result.ok ? "✓ Conexión OK" : `✗ Error en stage: ${result.stage}`}
            </p>
            <p className="mt-1 text-xs text-ink/75">{result.message}</p>
            {result.ok && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-ink/55 hover:text-ink/80">
                  Ver primeras 3 entradas
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink p-3 font-mono text-[10px] text-bone/80">
                  {JSON.stringify(result.sample, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>
    </>
  );
}
