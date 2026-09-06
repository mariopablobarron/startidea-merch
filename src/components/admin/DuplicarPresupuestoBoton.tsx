"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Copia un presupuesto y abre el editor de la copia.
 *
 * El caso real es «lo mismo que el año pasado pero 500 en vez de 300». La
 * copia sale en borrador, con su propio número y con TODOS los costes
 * marcados como no verificados: la tarifa de hace seis meses no es la de hoy.
 */
export function DuplicarPresupuestoBoton({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [copiando, setCopiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicar() {
    setCopiando(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/presupuestos/${id}/duplicar`, { method: "POST" });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? "No se pudo duplicar");
      router.push(`/admin/presupuestos/${datos.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCopiando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={duplicar}
        disabled={copiando}
        title={`Copiar ${numero} en un presupuesto nuevo`}
        className="text-xs text-ink/40 hover:text-accent disabled:opacity-50"
      >
        {copiando ? "Copiando…" : "Duplicar"}
      </button>
      {error && <span className="block text-xs font-semibold text-red-600">{error}</span>}
    </>
  );
}
