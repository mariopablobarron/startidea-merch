"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MargenesPresupuesto } from "@/lib/presupuesto-margenes";

/**
 * Margen por defecto y por familia de producto.
 *
 * El 30 % del encargo es el valor inicial, no una constante escrita a fuego: el
 * gran formato se cotiza con el PVP recomendado del portal, que ya lleva su
 * margen, y hay familias donde el mercado no aguanta el mismo punto.
 */
export function MargenesForm({ inicial }: { inicial: MargenesPresupuesto }) {
  const router = useRouter();
  const [pordefecto, setPordefecto] = useState(inicial.pordefecto);
  const [familias, setFamilias] = useState<Array<[string, number]>>(
    Object.entries(inicial.familias),
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const r = await fetch("/api/admin/presupuestos/ajustes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pordefecto,
          familias: Object.fromEntries(
            familias.filter(([nombre]) => nombre.trim() !== "").map(([n, m]) => [n.trim(), m]),
          ),
        }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? "No se pudo guardar");
      setMensaje("Ajustes guardados.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-base font-semibold">Margen por familia</h2>
      <p className="mt-1 text-sm text-ink/60">
        Margen sobre el <strong>precio de venta</strong> (PVP = coste ÷ (1 − margen)). Es el valor
        con el que sale cada línea nueva; en el presupuesto y en cada línea se puede cambiar.
      </p>

      <div className="mt-4 max-w-xs">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-ink/50">Margen por defecto</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              min={0}
              max={94.5}
              value={pordefecto}
              onChange={(e) => setPordefecto(Number(e.target.value))}
              className="w-24 rounded border border-line px-2 py-1.5 text-right text-sm tabular-nums"
            />
            <span className="text-sm text-ink/60">%</span>
          </div>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {familias.map(([nombre, margen], i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={nombre}
              placeholder="Familia (vasos, textil, gran formato…)"
              onChange={(e) =>
                setFamilias((f) => f.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))
              }
              className="w-64 rounded border border-line px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              step="0.5"
              min={0}
              max={94.5}
              value={margen}
              onChange={(e) =>
                setFamilias((f) => f.map((x, j) => (j === i ? [x[0], Number(e.target.value)] : x)))
              }
              className="w-24 rounded border border-line px-2 py-1.5 text-right text-sm tabular-nums"
            />
            <span className="text-sm text-ink/60">%</span>
            <button
              type="button"
              onClick={() => setFamilias((f) => f.filter((_, j) => j !== i))}
              className="text-xs text-ink/40 hover:text-red-600"
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFamilias((f) => [...f, ["", pordefecto]])}
          className="rounded border border-line px-3 py-1.5 text-xs text-ink/60 hover:border-accent hover:text-accent"
        >
          + Añadir familia
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar ajustes"}
        </button>
        {mensaje && <span className="text-sm text-ink/60">{mensaje}</span>}
        {error && <span className="text-sm font-semibold text-red-600">{error}</span>}
      </div>
    </section>
  );
}
