"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductoParaLinea } from "@/lib/presupuesto-catalogo";

/**
 * Busca en el catálogo y devuelve el producto elegido para rellenar una línea.
 *
 * Trae identidad, medidas y datos de marcaje con confianza; el coste llega como
 * SUGERENCIA, porque el encargo dice que el catálogo propio no es fuente de
 * precio. Quien llama marca la línea como no verificada.
 */
export function BuscadorCatalogo({
  cantidadInicial,
  onElegir,
}: {
  /** Cantidad de partida, editable aquí: el coste depende del tramo. */
  cantidadInicial: number;
  onElegir: (producto: ProductoParaLinea, cantidad: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // La cantidad manda sobre el precio, así que se decide ANTES de elegir: con
  // 100 uds y con 2.000 el proveedor cobra distinto y el margen cambia entero.
  const [cantidad, setCantidad] = useState(cantidadInicial);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductoParaLinea[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera: el desplegable tapa las líneas de abajo.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // Buscar con freno: sin esto son diez consultas mientras se escribe "camiseta".
  useEffect(() => {
    if (!abierto || q.trim().length < 2) {
      setItems([]);
      return;
    }
    const id = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/admin/presupuestos/catalogo?q=${encodeURIComponent(q)}&cantidad=${cantidad}`,
        );
        const datos = await r.json();
        if (!r.ok) throw new Error(datos?.error ?? "No se pudo buscar");
        setItems(datos.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q, cantidad, abierto]);

  const eur = (cents: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="rounded border border-line px-2 py-1 text-xs text-ink/60 hover:border-accent hover:text-accent"
      >
        Traer del catálogo
      </button>

      {abierto && (
        <div className="absolute left-0 z-20 mt-1 w-[30rem] max-w-[80vw] rounded-lg border border-line bg-white p-3 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o referencia STM-…"
            className="w-full rounded border border-line px-2 py-1.5 text-sm"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-ink/60">
            Cantidad para el tramo
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
              className="w-24 rounded border border-line px-2 py-1 text-right tabular-nums"
            />
          </label>
          <p className="mt-1 text-[11px] text-ink/45">
            Trae nombre, referencia, foto y área de marcaje. El coste viene del catálogo:
            <strong className="text-ink/70"> confírmalo en el portal</strong> antes de enviar.
          </p>

          {buscando && <p className="mt-2 text-xs text-ink/50">Buscando…</p>}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          {!buscando && q.trim().length >= 2 && items.length === 0 && !error && (
            <p className="mt-2 text-xs text-ink/50">Nada con ese nombre o referencia.</p>
          )}

          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {items.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onElegir(p, cantidad);
                    setAbierto(false);
                    setQ("");
                  }}
                  className="flex w-full items-start gap-2 rounded border border-transparent p-2 text-left hover:border-line hover:bg-ink/[0.02]"
                >
                  {p.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagenUrl} alt="" className="h-10 w-10 flex-none rounded object-contain" />
                  ) : (
                    <span className="h-10 w-10 flex-none rounded border border-dashed border-line" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="block text-[11px] text-ink/50">
                      {p.referencia}
                      {p.marcaje?.areaMaxima ? ` · marcaje ${p.marcaje.areaMaxima}` : ""}
                    </span>
                    {p.familias.length > 0 && (
                      <span className="block text-[11px] text-ink/40">
                        {p.familias[0]} · margen {p.margenFamiliaPct} %
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-right text-xs">
                    {p.costeUnitCents != null ? (
                      <>
                        <span className="block font-semibold tabular-nums">
                          {eur(p.costeUnitCents)}
                        </span>
                        <span className="block text-[10px] text-ink/40">
                          coste · tramo {p.tramoMinQty}+
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-ink/40">sin tarifa</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
