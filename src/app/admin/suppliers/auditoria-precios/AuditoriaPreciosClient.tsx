"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditoriaPrecios, Supplier } from "@/lib/auditoria-precios";
import { SUPPLIERS } from "@/lib/auditoria-precios";

const EUR = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

function Seccion({
  letra,
  titulo,
  explica,
  children,
}: {
  letra: string;
  titulo: string;
  explica: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-line bg-bone-soft p-5">
      <h2 className="font-display text-lg font-semibold text-ink">
        <span className="mr-2 text-ink/40">{letra}</span>
        {titulo}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink/60">{explica}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Fila de recuento por proveedor, con el total y su semáforo. */
function Recuento({
  datos,
  total,
  bienSiCero,
}: {
  datos: Record<Supplier, number>;
  total: number;
  bienSiCero?: boolean;
}) {
  const mal = bienSiCero && total > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SUPPLIERS.map((s) => (
        <span
          key={s}
          className="rounded-full border border-line bg-bone px-3 py-1 text-sm text-ink/80"
        >
          {s} <strong className="ml-1 tabular-nums">{datos[s]}</strong>
        </span>
      ))}
      <span
        className={`rounded-full px-3 py-1 text-sm font-semibold ${
          mal ? "bg-accent/15 text-accent" : "bg-ink/5 text-ink/70"
        }`}
      >
        total <span className="tabular-nums">{total}</span>
        {bienSiCero ? (mal ? " ⚠" : " ✓") : null}
      </span>
    </div>
  );
}

export function AuditoriaPreciosClient() {
  const [datos, setDatos] = useState<AuditoriaPrecios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/suppliers/auditoria-precios", { cache: "no-store" });
      // El `ok` antes del `json()`: un 500 devuelve HTML de error y el parseo
      // reventaría tapando el motivo real.
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => null);
        throw new Error(cuerpo?.error ?? `La auditoría respondió ${r.status}`);
      }
      const cuerpo = await r.json();
      setDatos(cuerpo.auditoria);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido cargar la auditoría");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <p className="text-sm font-medium text-accent">{error}</p>
        <button
          onClick={() => void cargar()}
          className="mt-3 rounded-full border border-line bg-bone px-4 py-2 text-sm"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!datos) {
    return (
      <p className="mt-6 text-sm text-ink/50">
        {cargando ? "Contando el catálogo entero, tarda unos segundos…" : "Cargando…"}
      </p>
    );
  }

  const { sinPrecio, sinTarifa, horquillaVariantes, adivin, margenEfectivo, margen } = datos;
  // Los de margen flojo de los cuatro proveedores, en una sola lista: son
  // pocos y lo que interesa es verlos juntos, no buscarlos proveedor a
  // proveedor.
  const flojos = SUPPLIERS.flatMap((s) => margenEfectivo[s].flojos.map((f) => ({ s, f })));

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink/60">
        <span>
          Margen global: <strong>×{margen.multiplicador.toFixed(4)}</strong> ={" "}
          <strong>{margen.sobreVentaPct.toFixed(1)} %</strong> sobre venta
        </span>
        <span className="text-ink/30">·</span>
        <span>{new Date(datos.generadaEn).toLocaleString("es-ES")}</span>
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="rounded-full border border-line bg-bone px-3 py-1 text-xs disabled:opacity-50"
        >
          {cargando ? "Contando…" : "Recalcular"}
        </button>
      </div>

      <Seccion
        letra="A"
        titulo="Activos sin precio"
        explica={
          <>
            Debería ser <strong>0</strong>: el barrido posterior a cada sync desactiva lo que se
            queda sin precio. Si sale más, ese barrido no está corriendo y hay fichas publicadas sin
            precio.
          </>
        }
      >
        <Recuento datos={sinPrecio.porProveedor} total={sinPrecio.total} bienSiCero />
      </Seccion>

      <Seccion
        letra="B"
        titulo="Activos sin tarifa real del proveedor"
        explica={
          <>
            En estos la web no tiene tramos del proveedor, así que va a{" "}
            <strong>tarifa plana</strong>: no se vende por debajo del coste, pero{" "}
            <strong>tampoco hay descuento por volumen</strong> — el precio es el mismo a 10 que a
            1.000 uds. Es donde perdemos pedidos grandes por precio. Este número dice a cuántos
            productos les falta tarifa negociada.
          </>
        }
      >
        <Recuento datos={sinTarifa.porProveedor} total={sinTarifa.total} />
        {sinTarifa.total > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4 text-right">Coste</th>
                  <th className="py-2 pr-4 text-right">Desde</th>
                </tr>
              </thead>
              <tbody>
                {SUPPLIERS.flatMap((s) =>
                  sinTarifa.ejemplos[s].map((p) => (
                    <tr key={`${s}-${p.slug}`} className="border-t border-line/60">
                      <td className="py-2 pr-4">
                        <span className="text-ink/40">{s}</span> · {p.name}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{EUR(p.costeCents)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{EUR(p.desdeCents)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        letra="C"
        titulo="Productos cuyas variantes no cuestan lo mismo"
        explica={
          <>
            Aquí la talla o el color que elige el cliente <strong>cambia el precio de verdad</strong>.
            La ficha ya cotiza la variante elegida; este recuento dice en cuántos productos ese
            arreglo mueve la cifra, y cuánto.
          </>
        }
      >
        <Recuento datos={horquillaVariantes.porProveedor} total={horquillaVariantes.total} />
        {horquillaVariantes.total > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="py-2 pr-4">Producto</th>
                  <th className="py-2 pr-4 text-right">Variantes</th>
                  <th className="py-2 pr-4 text-right">Horquilla</th>
                  <th className="py-2 pr-4 text-right">Salto</th>
                </tr>
              </thead>
              <tbody>
                {SUPPLIERS.flatMap((s) =>
                  horquillaVariantes.ejemplos[s].map((f) => (
                    <tr key={`${s}-${f.slug}`} className="border-t border-line/60">
                      <td className="py-2 pr-4">
                        <span className="text-ink/40">{s}</span> · {f.name}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{f.variantes}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {EUR(f.minCents)} – {EUR(f.maxCents)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        +{f.saltoPct.toFixed(0)} %
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        letra="D"
        titulo="Ádivin: precio fijado a mano"
        explica={
          <>
            Se publica al PVP recomendado del proveedor, que es lo correcto —evita aplicarle el
            margen global encima y cobrar de más—. Pero su <strong>coste neto no está en la base de
            datos</strong>, así que el sistema no puede calcular ni avisar del margen real de estos
            productos.
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-line bg-bone px-3 py-1 text-sm">
            activos <strong className="tabular-nums">{adivin.activos}</strong>
          </span>
          <span className="rounded-full border border-line bg-bone px-3 py-1 text-sm">
            con precio fijado <strong className="tabular-nums">{adivin.conPrecioFijado}</strong>
          </span>
        </div>
      </Seccion>

      <Seccion
        letra="E"
        titulo="Margen que aplica la web de verdad"
        explica={
          <>
            El precio publicado contra el coste, producto a producto, pasando por la misma función
            que calcula el precio en la ficha. Sin precio fijado a mano sale el{" "}
            <strong>{margen.sobreVentaPct.toFixed(1)} %</strong> del multiplicador; los que se
            desvían llevan override del panel, y son justo los que hay que mirar.
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2 pr-4">Proveedor</th>
                <th className="py-2 pr-4 text-right">Muestra</th>
                <th className="py-2 pr-4 text-right">Margen medio</th>
                <th className="py-2 pr-4 text-right">Con precio fijado</th>
              </tr>
            </thead>
            <tbody>
              {SUPPLIERS.map((s) => {
                const m = margenEfectivo[s];
                return (
                  <tr key={s} className="border-t border-line/60">
                    <td className="py-2 pr-4">{s}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m.muestra}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {m.margenMedioPct == null ? "—" : `${m.margenMedioPct.toFixed(1)} %`}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{m.conPrecioFijado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {flojos.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-ink">
              Por debajo del {margenEfectivo.midocean.umbralFlojoPct} % de margen
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="py-2 pr-4">Producto</th>
                    <th className="py-2 pr-4 text-right">Coste</th>
                    <th className="py-2 pr-4 text-right">Desde</th>
                    <th className="py-2 pr-4 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {flojos.map(({ s, f }) => (
                    <tr key={`${s}-${f.slug}`} className="border-t border-line/60">
                      <td className="py-2 pr-4">
                        <span className="text-ink/40">{s}</span> · {f.slug}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{EUR(f.costeCents)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{EUR(f.desdeCents)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-accent">
                        {f.margenPct.toFixed(1)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Seccion>
    </>
  );
}
