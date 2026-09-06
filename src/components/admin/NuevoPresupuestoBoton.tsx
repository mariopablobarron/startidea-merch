"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Crea un presupuesto en blanco y abre su editor.
 *
 * Se crea con una partida y una opción ya puestas: un editor completamente
 * vacío obliga a adivinar por dónde se empieza, y la estructura del documento
 * (partida → opción → líneas) se entiende mejor viéndola.
 */
export function NuevoPresupuestoBoton() {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/presupuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asunto: "Nuevo presupuesto",
          clienteNombre: "Cliente por definir",
          validezDias: 30,
          plazoMinDias: 8,
          plazoMaxDias: 15,
          margenObjetivoPct: 30,
          produccionCentroEspecialEmpleo: false,
          partidas: [
            {
              titulo: "Partida 1",
              opciones: [{ nombre: "única", recomendada: true, lineas: [] }],
            },
          ],
        }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? "No se pudo crear");
      router.push(`/admin/presupuestos/${datos.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreando(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={crear}
        disabled={creando}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {creando ? "Creando…" : "Nuevo presupuesto"}
      </button>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
