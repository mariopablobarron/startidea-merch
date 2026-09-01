"use client";

import { useEffect, useRef, useState } from "react";
import type { MarcajeParaLinea, ProductoParaLinea } from "@/lib/presupuesto-catalogo";

/**
 * Busca en el catálogo y devuelve el producto —y, si se quiere, su marcaje—
 * para rellenar las líneas de una opción.
 *
 * Va en dos pasos a propósito. Producto, marcaje y cliché no son tres
 * decisiones: son una. Dejar la serigrafía para después, a mano, es donde se
 * quedan los presupuestos sin la línea del cliché.
 *
 * Trae identidad, medidas y datos de marcaje con confianza; los costes llegan
 * como SUGERENCIA, porque el encargo dice que el catálogo propio no es fuente
 * de precio. Quien llama marca las líneas como no verificadas.
 */
export function BuscadorCatalogo({
  cantidadInicial,
  onElegir,
}: {
  /** Cantidad de partida, editable aquí: el coste depende del tramo. */
  cantidadInicial: number;
  onElegir: (
    producto: ProductoParaLinea,
    cantidad: number,
    marcaje: MarcajeParaLinea | null,
  ) => void;
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

  // Paso 2: producto elegido y sus técnicas de marcaje.
  const [elegido, setElegido] = useState<ProductoParaLinea | null>(null);
  const [tecnicas, setTecnicas] = useState<MarcajeParaLinea[] | null>(null);
  const [tecnicaCodigo, setTecnicaCodigo] = useState<string | null>(null);
  const [cargandoTecnicas, setCargandoTecnicas] = useState(false);

  function cerrar() {
    setAbierto(false);
    setElegido(null);
    setTecnicas(null);
    setTecnicaCodigo(null);
    setQ("");
  }

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
    if (!abierto || elegido || q.trim().length < 2) {
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
  }, [q, cantidad, abierto, elegido]);

  // Técnicas del producto elegido, tarificadas a esta cantidad. Se vuelven a
  // pedir si se cambia la cantidad: el tramo del marcaje también escala.
  useEffect(() => {
    if (!elegido) return;
    let vigente = true;
    setCargandoTecnicas(true);
    setTecnicas(null);
    fetch(
      `/api/admin/presupuestos/catalogo/marcaje?slug=${encodeURIComponent(elegido.slug)}&cantidad=${cantidad}`,
    )
      .then((r) => r.json())
      .then((datos) => {
        if (vigente) setTecnicas(datos.tecnicas ?? []);
      })
      .catch(() => {
        if (vigente) setTecnicas([]);
      })
      .finally(() => {
        if (vigente) setCargandoTecnicas(false);
      });
    return () => {
      vigente = false;
    };
  }, [elegido, cantidad]);

  const eur = (cents: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

  const marcajeElegido = tecnicas?.find((t) => t.codigo === tecnicaCodigo) ?? null;

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className="rounded border border-line px-2 py-1 text-xs text-ink/60 hover:border-accent hover:text-accent"
      >
        Traer del catálogo
      </button>

      {abierto && (
        <div className="absolute left-0 z-20 mt-1 w-[34rem] max-w-[85vw] rounded-lg border border-line bg-white p-3 shadow-lg">
          <label className="flex items-center gap-2 text-xs text-ink/60">
            Cantidad para el tramo
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
              className="w-24 rounded border border-line px-2 py-1 text-right tabular-nums"
            />
          </label>

          {!elegido ? (
            <>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre o referencia STM-…"
                className="mt-2 w-full rounded border border-line px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-[11px] text-ink/45">
                Trae nombre, referencia, foto y área de marcaje. Los costes vienen del catálogo:
                <strong className="text-ink/70"> confírmalos en el portal</strong> antes de enviar.
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
                        setElegido(p);
                        setTecnicaCodigo(null);
                      }}
                      className="flex w-full items-start gap-2 rounded border border-transparent p-2 text-left hover:border-line hover:bg-ink/[0.02]"
                    >
                      {p.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imagenUrl}
                          alt=""
                          className="h-10 w-10 flex-none rounded object-contain"
                        />
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
            </>
          ) : (
            <>
              <div className="mt-2 flex items-start gap-2 rounded border border-line p-2">
                {elegido.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={elegido.imagenUrl}
                    alt=""
                    className="h-10 w-10 flex-none rounded object-contain"
                  />
                ) : (
                  <span className="h-10 w-10 flex-none rounded border border-dashed border-line" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{elegido.nombre}</span>
                  <span className="block text-[11px] text-ink/50">
                    {elegido.referencia}
                    {elegido.costeUnitCents != null
                      ? ` · ${eur(elegido.costeUnitCents)}/ud (tramo ${elegido.tramoMinQty}+)`
                      : " · sin tarifa"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setElegido(null);
                    setTecnicas(null);
                    setTecnicaCodigo(null);
                  }}
                  className="flex-none text-[11px] text-ink/40 hover:text-accent"
                >
                  cambiar
                </button>
              </div>

              <p className="mt-3 text-[11px] uppercase tracking-wider text-ink/50">
                Marcaje · añade su línea y la del cliché
              </p>
              {cargandoTecnicas && <p className="mt-1 text-xs text-ink/50">Tarificando…</p>}
              {tecnicas && tecnicas.length === 0 && !cargandoTecnicas && (
                <p className="mt-1 text-xs text-ink/50">
                  Este producto no trae técnicas de marcaje en el catálogo. La línea se añade a
                  mano.
                </p>
              )}

              <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto">
                {(tecnicas ?? []).map((t) => (
                  <li key={t.codigo}>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-transparent p-2 hover:border-line hover:bg-ink/[0.02]">
                      <input
                        type="radio"
                        name="tecnica"
                        className="mt-1"
                        checked={tecnicaCodigo === t.codigo}
                        onChange={() => setTecnicaCodigo(t.codigo)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{t.nombre}</span>
                        {t.aviso ? (
                          <span className="block text-[11px] font-semibold text-amber-700">
                            {t.aviso}
                          </span>
                        ) : (
                          <span className="block text-[11px] text-ink/50">
                            {eur(t.costeUnitCents ?? 0)}/ud · cliché {eur(t.clicheCents)}
                            {t.areaCm2 ? ` · tarifado a ${Math.round(t.areaCm2)} cm²` : ""}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {tecnicaCodigo && (
                <button
                  type="button"
                  onClick={() => setTecnicaCodigo(null)}
                  className="mt-1 text-[11px] text-ink/40 hover:text-accent"
                >
                  Sin marcaje: añadir solo el producto
                </button>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onElegir(elegido, cantidad, marcajeElegido);
                    cerrar();
                  }}
                  className="rounded bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {marcajeElegido ? "Añadir producto, marcaje y cliché" : "Añadir solo el producto"}
                </button>
                <span className="text-[11px] text-ink/45">
                  Los costes entran sin confirmar: míralos en el portal.
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
