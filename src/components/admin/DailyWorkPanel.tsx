"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * «Hoy» — lo que tiene pendiente quien está mirando, y nada más.
 *
 * Antes esta caja enseñaba una única lista (carritos de más de 24 h) y decía
 * «no aparecen cotizaciones» aunque hubiera presupuestos sin enviar o un
 * pedido que había fallado al cursarse. Ahora lee `/api/admin/cola`, que ya
 * devuelve solo las colas del rol y solo las que no están vacías.
 *
 * Pide sus propios datos en vez de recibirlos del dashboard: si los KPIs
 * fallan, el trabajo del día se sigue viendo. Es lo único de esta pantalla que
 * de verdad hace falta para trabajar.
 */

type ItemDeCola = {
  id: string;
  titulo: string;
  subtitulo: string | null;
  desde: string;
  href: string;
};

type Cola = {
  clave: string;
  titulo: string;
  porque: string;
  urgencia: 1 | 2 | 3;
  total: number;
  verTodas: string | null;
  items: ItemDeCola[];
};

type Respuesta = {
  ok: true;
  generatedAt: string;
  rol: string;
  pendientes: number;
  colas: Cola[];
};

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-bone-soft px-4 py-3 text-base font-medium text-ink transition-colors duration-150 hover:border-ink/40 hover:bg-bone active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-deep";

const hora = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const relativo = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });

/** «hace 3 días», «hace 2 horas». Sin exagerar: por debajo de una hora, «hace
 *  un momento» dice más que «hace 41 minutos» y no envejece mal en pantalla. */
function desdeHace(iso: string, ahora: number): string {
  const ms = ahora - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 60) return "hace un momento";
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return relativo.format(-horas, "hour");
  const dias = Math.floor(horas / 24);
  if (dias < 30) return relativo.format(-dias, "day");
  return relativo.format(-Math.floor(dias / 30), "month");
}

/**
 * Lo roto se ve antes de leerlo. Solo el borde no bastaba —al mirar la captura
 * no se distinguía de una cola normal—, así que el contador también cambia de
 * color. Nada de fondos magenta masivos: el manual los prohíbe y, si todo
 * grita, no destaca nada.
 */
const BORDE: Record<number, string> = {
  1: "border-accent-deep/50",
  2: "border-line",
  3: "border-line",
};

const CONTADOR: Record<number, string> = {
  1: "bg-accent-deep text-bone",
  2: "bg-ink text-bone",
  3: "bg-bone-soft text-ink ring-1 ring-line",
};

/**
 * La vista, sin red. Separada de la carga para poder renderizarla tal cual —
 * en un test, o en una captura— sin levantar sesión ni base de datos. Todo lo
 * que se ve sale de aquí; `DailyWorkPanel` solo decide qué pasarle.
 */
export function VistaCola({
  data,
  error,
  sesionCaducada,
  cargando,
  ahora,
  onReintentar,
}: {
  data: Respuesta | null;
  error: string | null;
  sesionCaducada: boolean;
  cargando: boolean;
  /** Momento con el que se calcula el «hace X». null = todavía no montó. */
  ahora: number | null;
  onReintentar: () => void;
}) {
  const pendientes = data?.pendientes ?? 0;
  const primerItem = data?.colas[0]?.items[0];

  return (
    <section
      aria-labelledby="daily-work-title"
      className="mb-8 min-w-0 rounded-3xl border border-line bg-bone p-4 text-base leading-relaxed sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-accent-deep">Tu trabajo</p>
          <h2 id="daily-work-title" className="mt-1 font-display text-3xl font-semibold leading-tight text-ink">
            Hoy
          </h2>
          {data && (
            <p className="mt-2 max-w-prose text-ink/75">
              {pendientes === 0
                ? "No tienes nada pendiente. Todo lo que te toca está al día."
                : `${pendientes} ${pendientes === 1 ? "cosa pendiente" : "cosas pendientes"}, empezando por lo más urgente.`}
            </p>
          )}
        </div>

        {primerItem && (
          <Link
            href={primerItem.href}
            className="inline-flex min-h-12 max-w-full items-center justify-center gap-3 rounded-xl bg-ink px-5 py-3 text-base font-semibold text-bone transition-colors duration-150 hover:bg-ink-soft active:bg-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-deep"
          >
            <span>Empezar por aquí</span>
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-accent-deep/20 bg-accent-wash p-4 text-accent-deep">
          <p>{data ? "No se ha podido actualizar. Se mantiene la última lectura." : error}</p>
          {sesionCaducada ? (
            <Link href="/admin/login" className={`${linkClass} mt-3`}>
              Iniciar sesión
            </Link>
          ) : (
            <button
              type="button"
              onClick={onReintentar}
              disabled={cargando}
              className={`${linkClass} mt-3 disabled:cursor-wait disabled:opacity-50`}
            >
              {cargando ? "Actualizando…" : "Reintentar"}
            </button>
          )}
        </div>
      )}

      {!data && cargando && (
        <p role="status" className="mt-5 text-ink/75">
          Cargando tu trabajo de hoy…
        </p>
      )}

      {data && data.colas.length === 0 && !error && (
        <div className="mt-5 rounded-xl bg-bone-soft p-4 text-ink/75">
          <p>Nada esperando por tu parte ahora mismo.</p>
          <p className="mt-2">
            Si quieres adelantar trabajo, mira{" "}
            <Link href="/admin/cart-quotes" className="font-medium text-accent-deep underline">
              las cotizaciones
            </Link>{" "}
            o{" "}
            <Link href="/admin/presupuestos" className="font-medium text-accent-deep underline">
              los presupuestos
            </Link>
            .
          </p>
        </div>
      )}

      {data && data.colas.length > 0 && (
        <div className="mt-6 grid min-w-0 items-start gap-4 lg:grid-cols-2">
          {data.colas.map((cola) => (
            <article
              key={cola.clave}
              className={`min-w-0 rounded-2xl border bg-bone-soft/60 p-4 ${BORDE[cola.urgencia] ?? "border-line"}`}
            >
              {/* Sin `flex-wrap`: cuando el título ocupa dos líneas —y en móvil
                  ocupa dos— el contador se caía solo a una línea suya. Con el
                  título encogible (`min-w-0`) se queda clavado arriba a la
                  derecha, que es donde se busca. */}
              <header className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 font-display text-xl font-semibold leading-snug text-ink">{cola.titulo}</h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${CONTADOR[cola.urgencia] ?? CONTADOR[2]}`}
                >
                  {cola.total}
                </span>
              </header>
              <p className="mt-1 text-ink/75">{cola.porque}</p>

              <ol className="mt-3 divide-y divide-line">
                {cola.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-2 py-3 text-ink transition-colors duration-150 hover:bg-bone active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold [overflow-wrap:anywhere]">{item.titulo}</p>
                        {item.subtitulo && (
                          <p className="break-words text-ink/75 [overflow-wrap:anywhere]">{item.subtitulo}</p>
                        )}
                        <p className="text-ink/75">
                          <time dateTime={item.desde} title={hora.format(new Date(item.desde))}>
                            {ahora ? desdeHace(item.desde, ahora) : hora.format(new Date(item.desde))}
                          </time>
                        </p>
                      </div>
                      <span aria-hidden="true" className="shrink-0 text-lg text-accent-deep">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>

              {cola.total > cola.items.length && (
                <p className="mt-2 px-2 text-ink/75">
                  {cola.total - cola.items.length} más sin listar.
                </p>
              )}
              {cola.verTodas && (
                <Link href={cola.verTodas} className={`${linkClass} mt-3 w-full`}>
                  Ver todas
                </Link>
              )}
            </article>
          ))}
        </div>
      )}

      {data && (
        <p className="mt-5 text-ink/75">
          Última lectura: <time dateTime={data.generatedAt}>{hora.format(new Date(data.generatedAt))}</time>. Se
          actualiza sola cada minuto.
          {cargando && <span role="status"> Actualizando…</span>}
        </p>
      )}
    </section>
  );
}

export function DailyWorkPanel() {
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sesionCaducada, setSesionCaducada] = useState(false);
  const [cargando, setCargando] = useState(true);
  // El «hace X» se calcula en el cliente tras montar: renderizarlo en el
  // servidor daría un texto distinto al del navegador y React se quejaría.
  const [ahora, setAhora] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/admin/cola", { credentials: "include" });
      if (r.status === 401 || r.status === 403) {
        setSesionCaducada(true);
        setError("Inicia sesión para ver tu trabajo de hoy.");
        return;
      }
      if (!r.ok) {
        setError("No se ha podido cargar tu trabajo de hoy.");
        return;
      }
      setData(await r.json());
      setError(null);
      setSesionCaducada(false);
    } catch {
      setError("No se ha podido conectar con el panel. Comprueba la conexión y reintenta.");
    } finally {
      setCargando(false);
      setAhora(Date.now());
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <VistaCola
      data={data}
      error={error}
      sesionCaducada={sesionCaducada}
      cargando={cargando}
      ahora={ahora}
      onReintentar={cargar}
    />
  );
}
