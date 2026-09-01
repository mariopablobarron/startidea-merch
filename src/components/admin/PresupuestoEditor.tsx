"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SubidorImagen } from "@/components/admin/SubidorImagen";
import { BuscadorCatalogo } from "@/components/admin/BuscadorCatalogo";
import {
  fichaDesdeProducto,
  lineaDesdeProducto,
  type ProductoParaLinea,
} from "@/lib/presupuesto-catalogo";
import {
  calcularLinea,
  calcularEscenarios,
  pvpDesdeCoste,
  redondearPvpLimpio,
  MARGEN_AVISO_PCT,
  IVA_PCT,
  type TipoLinea,
} from "@/lib/presupuesto-calculo";

/**
 * Editor de un presupuesto.
 *
 * Todo el cálculo se hace con `presupuesto-calculo`, el MISMO módulo que usa el
 * documento: si la pantalla y el PDF contaran dinero distinto, el que se manda
 * al cliente sería el equivocado.
 *
 * Lo que la pantalla enseña siempre, junto al total: coste, precio de venta y
 * margen en euros y en porcentaje, recalculado al teclear. Y avisa en rojo por
 * debajo del 20 %: el momento de verlo es mientras se escribe, no cuando el
 * cliente ya ha aceptado.
 */

export type LineaForm = {
  tipo: TipoLinea;
  concepto: string;
  descripcion: string;
  referencia: string;
  imagenUrl: string;
  cantidad: number;
  costeUnitCents: number;
  /**
   * false = el coste vino del catálogo y nadie lo ha contrastado con el portal
   * del proveedor. El catálogo sirve para no teclear, no para cotizar.
   */
  costeVerificado: boolean;
  margenPct: number | null;
  pvpUnitCents: number;
};

export type OpcionForm = {
  nombre: string;
  recomendada: boolean;
  fotoProductoUrl: string;
  fotoMarcajeUrl: string;
  medidas: string;
  materiales: string;
  incluye: string;
  usoRecomendado: string;
  marcajeTecnica: string;
  marcajeTintas: string;
  marcajePosicion: string;
  marcajeAreaMaxima: string;
  marcajeFormatoArte: string;
  lineas: LineaForm[];
};

export type PartidaForm = {
  titulo: string;
  descripcion: string;
  opciones: OpcionForm[];
};

export type PresupuestoForm = {
  asunto: string;
  estado: "BORRADOR" | "ENVIADO" | "ACEPTADO" | "CADUCADO";
  clienteNombre: string;
  clienteContacto: string;
  clienteReferencia: string;
  clienteCif: string;
  clienteDireccion: string;
  clienteEmail: string;
  validezDias: number;
  plazoMinDias: number;
  plazoMaxDias: number;
  margenObjetivoPct: number;
  notaTecnicaTitulo: string;
  notaTecnica: string;
  cierreTexto: string;
  produccionCentroEspecialEmpleo: boolean;
  partidas: PartidaForm[];
};

export function lineaVacia(tipo: TipoLinea = "PRODUCTO"): LineaForm {
  return {
    tipo,
    concepto: "",
    descripcion: "",
    referencia: "",
    imagenUrl: "",
    cantidad: tipo === "CLICHE" ? 1 : 100,
    costeUnitCents: 0,
    // Teclear un coste a mano exige haberlo mirado en el portal: nace verificado.
    costeVerificado: true,
    margenPct: null,
    pvpUnitCents: 0,
  };
}

/**
 * `recomendada` va por parámetro: la primera opción de una partida lo es, y la
 * alternativa que se añade después NO. Con las dos a true —que es lo que
 * pasaba— el documento salía con dos bloques marcados «RECOMENDADA» y el
 * cliente no sabe cuál mirar, que es justo lo contrario de para lo que está.
 */
export function opcionVacia(nombre = "única", recomendada = true): OpcionForm {
  return {
    nombre,
    recomendada,
    fotoProductoUrl: "",
    fotoMarcajeUrl: "",
    medidas: "",
    materiales: "",
    incluye: "",
    usoRecomendado: "",
    marcajeTecnica: "",
    marcajeTintas: "",
    marcajePosicion: "",
    marcajeAreaMaxima: "",
    marcajeFormatoArte: "",
    lineas: [lineaVacia()],
  };
}

const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" }).format(
    cents / 100,
  );

const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

/** Céntimos ⇄ euros para los campos de dinero, sin arrastrar decimales. */
const aEuros = (cents: number) => (cents / 100).toFixed(2);
const aCents = (euros: string) => Math.round(parseFloat(euros.replace(",", ".") || "0") * 100);

const TIPOS: Array<{ valor: TipoLinea; etiqueta: string }> = [
  { valor: "PRODUCTO", etiqueta: "Producto" },
  { valor: "MARCAJE", etiqueta: "Marcaje" },
  { valor: "CLICHE", etiqueta: "Cliché / pantalla" },
  { valor: "OTRO", etiqueta: "Otro" },
];

export function PresupuestoEditor({
  id,
  numero,
  inicial,
  margenPorDefecto,
}: {
  id: string;
  numero: string;
  inicial: PresupuestoForm;
  margenPorDefecto: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PresupuestoForm>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const escenarios = useMemo(
    () =>
      calcularEscenarios(
        form.partidas.map((partida, iP) => ({
          id: `p${iP}`,
          titulo: partida.titulo,
          opciones: partida.opciones.map((opcion, iO) => ({
            id: `p${iP}o${iO}`,
            nombre: opcion.nombre,
            recomendada: opcion.recomendada,
            lineas: opcion.lineas.map((l) => ({
              tipo: l.tipo,
              cantidad: l.cantidad,
              costeUnitCents: l.costeUnitCents,
              pvpUnitCents: l.pvpUnitCents,
            })),
          })),
        })),
      ),
    [form.partidas],
  );

  /**
   * Cuántas líneas llevan un coste traído del catálogo y sin contrastar.
   *
   * Va en la barra fija, junto a los totales: un margen calculado sobre un
   * coste que nadie ha mirado en el portal es un margen inventado, y eso hay
   * que verlo antes de darle a «Descargar PDF», no después.
   */
  const costesSinConfirmar = useMemo(
    () =>
      form.partidas.flatMap((p) =>
        p.opciones.flatMap((o) =>
          o.lineas.filter((l) => !l.costeVerificado && l.costeUnitCents > 0),
        ),
      ).length,
    [form.partidas],
  );

  function editar(cambio: Partial<PresupuestoForm>) {
    setForm((f) => ({ ...f, ...cambio }));
  }

  function editarPartida(iP: number, cambio: Partial<PartidaForm>) {
    setForm((f) => ({
      ...f,
      partidas: f.partidas.map((p, i) => (i === iP ? { ...p, ...cambio } : p)),
    }));
  }

  function editarOpcion(iP: number, iO: number, cambio: Partial<OpcionForm>) {
    setForm((f) => ({
      ...f,
      partidas: f.partidas.map((p, i) =>
        i !== iP
          ? p
          : {
              ...p,
              opciones: p.opciones.map((o, j) => {
                if (j !== iO) {
                  // Solo puede haber una recomendada por partida.
                  return cambio.recomendada ? { ...o, recomendada: false } : o;
                }
                return { ...o, ...cambio };
              }),
            },
      ),
    }));
  }

  function editarLinea(iP: number, iO: number, iL: number, cambio: Partial<LineaForm>) {
    setForm((f) => ({
      ...f,
      partidas: f.partidas.map((p, i) =>
        i !== iP
          ? p
          : {
              ...p,
              opciones: p.opciones.map((o, j) =>
                j !== iO
                  ? o
                  : { ...o, lineas: o.lineas.map((l, k) => (k === iL ? { ...l, ...cambio } : l)) },
              ),
            },
      ),
    }));
  }

  /** Recalcula el PVP de una línea desde su coste y el margen que toque. */
  function aplicarMargen(iP: number, iO: number, iL: number, linea: LineaForm) {
    const margen = linea.margenPct ?? form.margenObjetivoPct;
    editarLinea(iP, iO, iL, { pvpUnitCents: redondearPvpLimpio(linea.costeUnitCents, margen) });
  }

  /**
   * Trae un producto del catálogo a la opción.
   *
   * Rellena la línea (concepto, referencia STM, foto, coste del tramo) y, si la
   * ficha técnica está vacía, también medidas, materiales, área y técnica de
   * marcaje. Lo que ya esté escrito NO se pisa: si alguien ha ajustado la ficha
   * a mano, su texto vale más que el del catálogo.
   *
   * El coste entra como `costeVerificado: false`. Es deliberado: el catálogo no
   * es fuente de precio, y la línea sale marcada en rojo hasta que alguien lo
   * contrasta en el portal a la cantidad exacta y lo toca.
   */
  function traerDelCatalogo(
    iP: number,
    iO: number,
    opcion: OpcionForm,
    producto: ProductoParaLinea,
    cantidad: number,
  ) {
    const nueva: LineaForm = {
      ...lineaVacia("PRODUCTO"),
      ...lineaDesdeProducto(producto, cantidad, form.margenObjetivoPct, (coste, margen) =>
        redondearPvpLimpio(coste, margen),
      ),
    };

    // Una línea recién creada y sin tocar se sustituye en vez de acumularse:
    // el caso normal es abrir la opción y buscar el producto acto seguido.
    const enBlanco = (l: LineaForm) =>
      l.concepto.trim() === "" && l.costeUnitCents === 0 && l.pvpUnitCents === 0;
    const lineas = opcion.lineas.every(enBlanco) ? [nueva] : [...opcion.lineas, nueva];

    editarOpcion(iP, iO, { lineas, ...fichaDesdeProducto(opcion, producto) });
  }

  /**
   * Guarda y descarga.
   *
   * Guardar antes NO es un detalle: el PDF lo arma el servidor leyendo la base
   * de datos, así que sin guardar saldría el presupuesto anterior y nadie
   * notaría la diferencia hasta que el cliente pregunte por un precio que no
   * existe.
   */
  async function descargarPdf() {
    setDescargando(true);
    setError(null);
    try {
      await guardar();
      const r = await fetch(`/api/admin/presupuestos/${id}/pdf`);
      if (!r.ok) {
        const datos = await r.json().catch(() => null);
        throw new Error(datos?.error ?? `No se pudo generar el PDF (${r.status})`);
      }
      const blob = await r.blob();
      const nombre =
        /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ??
        `${numero}.pdf`;
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
      setMensaje(`PDF generado: ${nombre}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescargando(false);
    }
  }

  async function guardar(estado?: PresupuestoForm["estado"]) {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const cuerpo = {
        ...form,
        estado: estado ?? form.estado,
        clienteEmail: form.clienteEmail || null,
        partidas: form.partidas.map((p) => ({
          titulo: p.titulo,
          descripcion: p.descripcion || null,
          opciones: p.opciones.map((o) => ({
            ...o,
            medidas: o.medidas || null,
            materiales: o.materiales || null,
            incluye: o.incluye || null,
            usoRecomendado: o.usoRecomendado || null,
            fotoProductoUrl: o.fotoProductoUrl || null,
            fotoMarcajeUrl: o.fotoMarcajeUrl || null,
            marcajeTecnica: o.marcajeTecnica || null,
            marcajeTintas: o.marcajeTintas || null,
            marcajePosicion: o.marcajePosicion || null,
            marcajeAreaMaxima: o.marcajeAreaMaxima || null,
            marcajeFormatoArte: o.marcajeFormatoArte || null,
            lineas: o.lineas.map((l) => ({
              ...l,
              descripcion: l.descripcion || null,
              referencia: l.referencia || null,
              imagenUrl: l.imagenUrl || null,
            })),
          })),
        })),
      };
      const r = await fetch(`/api/admin/presupuestos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = await r.json();
      if (!r.ok) {
        const detalle = datos?.detalles?.fieldErrors
          ? Object.entries(datos.detalles.fieldErrors)
              .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
              .join(" · ")
          : "";
        throw new Error([datos?.error ?? "No se pudo guardar", detalle].filter(Boolean).join(" — "));
      }
      if (estado) editar({ estado });
      setMensaje("Guardado.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Barra de estado: lo que hay que mirar antes de mandar nada ── */}
      <div className="sticky top-0 z-10 rounded-xl border border-line bg-white/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-accent">{numero}</div>
            <div className="font-display text-lg font-semibold">{form.asunto || "Sin asunto"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => guardar()}
              disabled={guardando}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <a
              href={`/api/admin/presupuestos/${id}/imprimir`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70"
            >
              Ver documento →
            </a>
            <button
              type="button"
              onClick={descargarPdf}
              disabled={descargando}
              className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50"
            >
              {descargando ? "Generando PDF…" : "Descargar PDF"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {escenarios.map((e) => (
            <div
              key={e.etiqueta}
              className={`rounded-lg border p-3 ${
                e.recomendado ? "border-accent bg-accent/5" : "border-line"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider text-ink/50">{e.etiqueta}</div>
              <div className="mt-1 font-display text-xl font-semibold text-accent">
                {eur(e.totales.totalCents)}
              </div>
              <dl className="mt-2 space-y-0.5 text-xs text-ink/60">
                <div className="flex justify-between">
                  <dt>Base</dt>
                  <dd className="tabular-nums">{eur(e.totales.baseCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>IVA {IVA_PCT} %</dt>
                  <dd className="tabular-nums">{eur(e.totales.ivaCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Coste</dt>
                  <dd className="tabular-nums">{eur(e.totales.costeCents)}</dd>
                </div>
                <div
                  className={`flex justify-between font-semibold ${
                    e.totales.margenPct < MARGEN_AVISO_PCT ? "text-red-600" : "text-ink"
                  }`}
                >
                  <dt>Margen</dt>
                  <dd className="tabular-nums">
                    {eur(e.totales.margenCents)} · {pct(e.totales.margenPct)}
                  </dd>
                </div>
              </dl>
              {e.totales.lineasBajoMargen > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-red-600">
                  {e.totales.lineasBajoMargen}{" "}
                  {e.totales.lineasBajoMargen === 1 ? "línea" : "líneas"} por debajo del{" "}
                  {MARGEN_AVISO_PCT} %
                </p>
              )}
            </div>
          ))}
        </div>

        {costesSinConfirmar > 0 && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {costesSinConfirmar}{" "}
            {costesSinConfirmar === 1
              ? "línea tiene un coste traído del catálogo sin confirmar"
              : "líneas tienen un coste traído del catálogo sin confirmar"}
            .{" "}
            <span className="font-normal">
              Contrástalo en el portal del proveedor a la cantidad exacta antes de mandar el
              presupuesto; al escribirlo en «Coste/ud» el aviso desaparece.
            </span>
          </p>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        {mensaje && <p className="mt-3 text-sm text-ink/60">{mensaje}</p>}
      </div>

      {/* ── Datos del presupuesto ── */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-base font-semibold">Oferta</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Campo etiqueta="Asunto" valor={form.asunto} onChange={(v) => editar({ asunto: v })} />
          <Campo
            etiqueta="Cliente"
            valor={form.clienteNombre}
            onChange={(v) => editar({ clienteNombre: v })}
          />
          <Campo
            etiqueta="Persona de contacto"
            valor={form.clienteContacto}
            onChange={(v) => editar({ clienteContacto: v })}
          />
          <Campo
            etiqueta="Referencia de origen"
            valor={form.clienteReferencia}
            onChange={(v) => editar({ clienteReferencia: v })}
          />
          <Campo etiqueta="CIF del cliente" valor={form.clienteCif} onChange={(v) => editar({ clienteCif: v })} />
          <Campo
            etiqueta="Email del cliente"
            valor={form.clienteEmail}
            onChange={(v) => editar({ clienteEmail: v })}
          />
          <CampoNumero
            etiqueta="Validez (días naturales)"
            valor={form.validezDias}
            onChange={(v) => editar({ validezDias: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero
              etiqueta="Plazo mín. (días)"
              valor={form.plazoMinDias}
              onChange={(v) => editar({ plazoMinDias: v })}
            />
            <CampoNumero
              etiqueta="Plazo máx. (días)"
              valor={form.plazoMaxDias}
              onChange={(v) => editar({ plazoMaxDias: v })}
            />
          </div>
          <CampoNumero
            etiqueta={`Margen objetivo (% sobre venta) · por defecto ${margenPorDefecto} %`}
            valor={form.margenObjetivoPct}
            onChange={(v) => editar({ margenObjetivoPct: v })}
            paso={0.5}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.produccionCentroEspecialEmpleo}
              onChange={(e) => editar({ produccionCentroEspecialEmpleo: e.target.checked })}
              className="mt-1"
            />
            <span>
              Este pedido se produce en Centros Especiales de Empleo
              <span className="block text-xs text-ink/50">
                Solo si es verdad en este pedido: la frase sale en el documento.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* ── Partidas ── */}
      {form.partidas.map((partida, iP) => (
        <section key={iP} className="rounded-xl border border-line bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-accent">
                Partida {String(iP + 1).padStart(2, "0")}
              </div>
              <Campo
                etiqueta="Título"
                valor={partida.titulo}
                onChange={(v) => editarPartida(iP, { titulo: v })}
              />
              <CampoArea
                etiqueta="Descripción"
                valor={partida.descripcion}
                onChange={(v) => editarPartida(iP, { descripcion: v })}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                editar({ partidas: form.partidas.filter((_, i) => i !== iP) })
              }
              className="text-xs text-ink/40 hover:text-red-600"
            >
              Quitar partida
            </button>
          </div>

          {partida.opciones.map((opcion, iO) => (
            <div key={iO} className="mt-5 rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink/50">
                    Opción {String.fromCharCode(65 + iO)}
                  </span>
                  <input
                    value={opcion.nombre}
                    onChange={(e) => editarOpcion(iP, iO, { nombre: e.target.value })}
                    className="rounded border border-line px-2 py-1 text-sm"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={opcion.recomendada}
                      onChange={(e) => editarOpcion(iP, iO, { recomendada: e.target.checked })}
                    />
                    Recomendada
                  </label>
                </div>
                {partida.opciones.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      editarPartida(iP, { opciones: partida.opciones.filter((_, i) => i !== iO) })
                    }
                    className="text-xs text-ink/40 hover:text-red-600"
                  >
                    Quitar opción
                  </button>
                )}
              </div>

              {/* Líneas */}
              <div className="mt-4 space-y-3">
                {opcion.lineas.map((linea, iL) => {
                  const totales = calcularLinea(linea);
                  const margen = linea.margenPct ?? form.margenObjetivoPct;
                  return (
                    <div
                      key={iL}
                      className={`rounded-lg border p-3 ${
                        totales.avisoMargen
                          ? "border-red-300 bg-red-50/50"
                          : !linea.costeVerificado && linea.costeUnitCents > 0
                            ? "border-amber-300 bg-amber-50/40"
                            : "border-line"
                      }`}
                    >
                      <div className="grid gap-2 md:grid-cols-[8rem_1fr_5rem_7rem_7rem]">
                        <select
                          value={linea.tipo}
                          onChange={(e) =>
                            editarLinea(iP, iO, iL, { tipo: e.target.value as TipoLinea })
                          }
                          className="rounded border border-line px-2 py-1 text-sm"
                        >
                          {TIPOS.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </select>
                        <input
                          value={linea.concepto}
                          placeholder="Concepto"
                          onChange={(e) => editarLinea(iP, iO, iL, { concepto: e.target.value })}
                          className="rounded border border-line px-2 py-1 text-sm"
                        />
                        <input
                          type="number"
                          min={1}
                          value={linea.cantidad}
                          onChange={(e) =>
                            editarLinea(iP, iO, iL, { cantidad: Math.max(1, Number(e.target.value)) })
                          }
                          className="rounded border border-line px-2 py-1 text-right text-sm tabular-nums"
                        />
                        <label className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-ink/40">
                            Coste/ud
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={aEuros(linea.costeUnitCents)}
                            onChange={(e) =>
                              // Tocar el coste a mano es el gesto de confirmarlo.
                              editarLinea(iP, iO, iL, {
                                costeUnitCents: aCents(e.target.value),
                                costeVerificado: true,
                              })
                            }
                            className="rounded border border-line px-2 py-1 text-right text-sm tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-wider text-ink/40">
                            PVP/ud
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={aEuros(linea.pvpUnitCents)}
                            onChange={(e) =>
                              editarLinea(iP, iO, iL, { pvpUnitCents: aCents(e.target.value) })
                            }
                            className="rounded border border-line px-2 py-1 text-right text-sm font-semibold tabular-nums"
                          />
                        </label>
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                        <input
                          value={linea.descripcion}
                          placeholder="Descripción (qué incluye, materiales, área de marcaje…)"
                          onChange={(e) => editarLinea(iP, iO, iL, { descripcion: e.target.value })}
                          className="rounded border border-line px-2 py-1 text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <input
                            value={linea.referencia}
                            placeholder="STM-…"
                            onChange={(e) => editarLinea(iP, iO, iL, { referencia: e.target.value })}
                            className="w-28 rounded border border-line px-2 py-1"
                          />
                          {linea.tipo !== "CLICHE" && (
                            <SubidorImagen
                              compacto
                              etiqueta="Miniatura de la línea"
                              valor={linea.imagenUrl}
                              onChange={(v) => editarLinea(iP, iO, iL, { imagenUrl: v })}
                            />
                          )}
                          <label className="flex items-center gap-1">
                            margen
                            <input
                              type="number"
                              step="0.5"
                              value={linea.margenPct ?? ""}
                              placeholder={String(form.margenObjetivoPct)}
                              onChange={(e) =>
                                editarLinea(iP, iO, iL, {
                                  margenPct: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              className="w-16 rounded border border-line px-1 py-1 text-right tabular-nums"
                            />
                            %
                          </label>
                          <button
                            type="button"
                            onClick={() => aplicarMargen(iP, iO, iL, linea)}
                            className="rounded border border-accent px-2 py-1 font-semibold text-accent"
                            title={`PVP = coste ÷ ${(1 - margen / 100).toFixed(2)} y redondeo limpio`}
                          >
                            Calcular PVP
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              editarOpcion(iP, iO, {
                                lineas: opcion.lineas.filter((_, i) => i !== iL),
                              })
                            }
                            className="text-ink/40 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink/60">
                        <span>
                          Importe <strong className="text-ink">{eur(totales.importeCents)}</strong>
                        </span>
                        <span>Coste {eur(totales.costeCents)}</span>
                        <span
                          className={totales.avisoMargen ? "font-semibold text-red-600" : undefined}
                        >
                          Margen {eur(totales.margenCents)} · {pct(totales.margenPct)}
                          {totales.avisoMargen ? ` (por debajo del ${MARGEN_AVISO_PCT} %)` : ""}
                        </span>
                        {linea.costeUnitCents > 0 && (
                          <span className="text-ink/40">
                            al {margen} % serían {eur(pvpDesdeCoste(linea.costeUnitCents, margen))}/ud
                          </span>
                        )}
                        {!linea.costeVerificado && linea.costeUnitCents > 0 && (
                          <span
                            className="font-semibold text-amber-700"
                            title="El catálogo no es fuente de precio: mira el portal del proveedor a esta cantidad exacta."
                          >
                            Coste del catálogo · sin confirmar
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <BuscadorCatalogo
                    cantidadInicial={
                      opcion.lineas.find((l) => l.tipo === "PRODUCTO")?.cantidad ?? 100
                    }
                    onElegir={(producto, cantidad) =>
                      traerDelCatalogo(iP, iO, opcion, producto, cantidad)
                    }
                  />
                  <span className="text-ink/30">·</span>
                  {TIPOS.map((t) => (
                    <button
                      key={t.valor}
                      type="button"
                      onClick={() =>
                        editarOpcion(iP, iO, { lineas: [...opcion.lineas, lineaVacia(t.valor)] })
                      }
                      className="rounded border border-line px-2 py-1 text-ink/60 hover:border-accent hover:text-accent"
                    >
                      + {t.etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ficha técnica */}
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Ficha técnica y marcaje (página 2)
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Campo etiqueta="Medidas" valor={opcion.medidas} onChange={(v) => editarOpcion(iP, iO, { medidas: v })} />
                  <Campo etiqueta="Materiales" valor={opcion.materiales} onChange={(v) => editarOpcion(iP, iO, { materiales: v })} />
                  <Campo etiqueta="Incluye" valor={opcion.incluye} onChange={(v) => editarOpcion(iP, iO, { incluye: v })} />
                  <Campo etiqueta="Uso" valor={opcion.usoRecomendado} onChange={(v) => editarOpcion(iP, iO, { usoRecomendado: v })} />
                  <SubidorImagen
                    etiqueta="Foto del producto"
                    valor={opcion.fotoProductoUrl}
                    onChange={(v) => editarOpcion(iP, iO, { fotoProductoUrl: v })}
                  />
                  <SubidorImagen
                    etiqueta="Zona de marcaje con cotas"
                    valor={opcion.fotoMarcajeUrl}
                    onChange={(v) => editarOpcion(iP, iO, { fotoMarcajeUrl: v })}
                  />
                  <Campo etiqueta="Técnica de marcaje" valor={opcion.marcajeTecnica} onChange={(v) => editarOpcion(iP, iO, { marcajeTecnica: v })} />
                  <Campo etiqueta="Número de tintas" valor={opcion.marcajeTintas} onChange={(v) => editarOpcion(iP, iO, { marcajeTintas: v })} />
                  <Campo etiqueta="Posición" valor={opcion.marcajePosicion} onChange={(v) => editarOpcion(iP, iO, { marcajePosicion: v })} />
                  <Campo etiqueta="Área máxima" valor={opcion.marcajeAreaMaxima} onChange={(v) => editarOpcion(iP, iO, { marcajeAreaMaxima: v })} />
                </div>
              </details>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              editarPartida(iP, {
                opciones: [
                  ...partida.opciones.map((o) => ({ ...o })),
                  opcionVacia(
                    `Opción ${String.fromCharCode(65 + partida.opciones.length)}`,
                    // La recomendada ya está elegida arriba; ésta es la alternativa.
                    false,
                  ),
                ],
              })
            }
            className="mt-4 rounded border border-line px-3 py-1.5 text-xs text-ink/60 hover:border-accent hover:text-accent"
          >
            + Añadir alternativa a esta partida
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() =>
          editar({
            partidas: [...form.partidas, { titulo: "", descripcion: "", opciones: [opcionVacia()] }],
          })
        }
        className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent"
      >
        + Añadir partida
      </button>

      {/* ── Nota técnica y cierre ── */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-base font-semibold">Notas y cierre</h2>
        <p className="mt-1 text-xs text-ink/50">
          Si lo que pide el cliente no es posible tal cual, aquí va la explicación con la
          alternativa. Sin nota, el documento no lleva el bloque.
        </p>
        <div className="mt-4 grid gap-4">
          <Campo
            etiqueta="Título de la nota"
            valor={form.notaTecnicaTitulo}
            onChange={(v) => editar({ notaTecnicaTitulo: v })}
          />
          <CampoArea
            etiqueta="Nota técnica"
            valor={form.notaTecnica}
            onChange={(v) => editar({ notaTecnica: v })}
          />
          <CampoArea
            etiqueta="Texto de cierre"
            valor={form.cierreTexto}
            onChange={(v) => editar({ cierreTexto: v })}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pb-10">
        <button
          type="button"
          onClick={() => guardar()}
          disabled={guardando}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            // Última red antes de que el precio salga de casa: marcar como
            // enviado con un coste que nadie ha mirado en el portal es firmar
            // un margen inventado.
            if (
              costesSinConfirmar > 0 &&
              !confirm(
                `Quedan ${costesSinConfirmar} ${
                  costesSinConfirmar === 1 ? "línea" : "líneas"
                } con un coste traído del catálogo sin confirmar en el portal del proveedor. ¿Marcar el presupuesto como enviado de todas formas?`,
              )
            ) {
              return;
            }
            void guardar("ENVIADO");
          }}
          disabled={guardando}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Marcar como enviado
        </button>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink/50">{etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function CampoArea({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink/50">{etiqueta}</span>
      <textarea
        value={valor}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function CampoNumero({
  etiqueta,
  valor,
  onChange,
  paso = 1,
}: {
  etiqueta: string;
  valor: number;
  onChange: (v: number) => void;
  paso?: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink/50">{etiqueta}</span>
      <input
        type="number"
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm tabular-nums"
      />
    </label>
  );
}
