"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Convierte un lead —un carrito de cotización o un formulario— en un
 * presupuesto en borrador y abre su editor.
 *
 * Hereda la estructura (cliente, productos, cantidades, marcaje) pero NO el
 * precio que el cliente vio en la web: ese lleva el margen automático de la
 * tienda, y un presupuesto se cotiza al margen del encargo sobre el coste
 * mirado en el portal. Los costes entran del catálogo sin verificar.
 */
export function CrearPresupuestoBoton({
  endpoint,
  etiqueta = "Crear presupuesto",
  className,
}: {
  /** Ruta POST que crea el presupuesto y devuelve `{ id, numero }`. */
  endpoint: string;
  etiqueta?: string;
  className?: string;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch(endpoint, { method: "POST" });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? "No se pudo crear el presupuesto");
      router.push(`/admin/presupuestos/${datos.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCreando(false);
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={crear}
        disabled={creando}
        title="Crea un presupuesto en borrador con estos datos y lo abre"
        className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-white disabled:opacity-50"
      >
        {creando ? "Creando…" : etiqueta}
      </button>
      {error && <span className="ml-2 text-xs font-semibold text-red-600">{error}</span>}
    </span>
  );
}
