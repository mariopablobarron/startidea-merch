import Link from "next/link";

type PendingCart = {
  id: string;
  name: string;
  company: string | null;
  status: string;
  createdAt: string;
};

type DailyWorkPanelProps = {
  data: { staleCarts: PendingCart[]; generatedAt: string } | null;
  loading: boolean;
  error: string | null;
  loginRequired: boolean;
  onRetry: () => void;
};

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-bone-soft px-4 py-3 text-base font-medium text-ink transition-colors duration-150 hover:border-ink/40 hover:bg-bone active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-deep";

const shortcuts = [
  { href: "/admin/cart-quotes", label: "Ver presupuestos" },
  { href: "/admin/propuestas?status=draft", label: "Revisar borradores" },
  { href: "/admin/orders", label: "Ver pedidos" },
  { href: "/admin/products", label: "Buscar productos" },
];

const receivedDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function DailyWorkPanel({ data, loading, error, loginRequired, onRetry }: DailyWorkPanelProps) {
  const first = data?.staleCarts[0];

  return (
    <section aria-labelledby="daily-work-title" className="mb-8 min-w-0 rounded-3xl border border-line bg-bone p-4 text-base leading-relaxed sm:p-6">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          <p className="font-medium text-accent-deep">Tu trabajo diario</p>
          <h2 id="daily-work-title" className="mt-1 font-display text-3xl font-semibold leading-tight text-ink">Hoy</h2>
          <p className="mt-3 max-w-prose text-ink/75">
            Empieza por las cotizaciones más antiguas. Abre una, revisa sus datos y decide el siguiente paso.
          </p>
          <p className="mt-3 max-w-prose text-ink/75">
            Esta vista muestra hasta 10 cotizaciones nuevas o en curso, recibidas hace más de 24 horas, de la más antigua a la más reciente.
          </p>

          {first && (
            <Link
              href={`/admin/cart-quotes/${first.id}`}
              className="mt-5 inline-flex min-h-12 max-w-full items-center justify-center gap-3 rounded-xl bg-ink px-5 py-3 text-base font-semibold text-bone transition-colors duration-150 hover:bg-ink-soft active:bg-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-deep"
            >
              <span>Revisar primera cotización</span><span aria-hidden="true">→</span>
            </Link>
          )}

          <nav aria-label="Accesos de trabajo diario" className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2">
            {shortcuts.map((shortcut) => (
              <Link key={shortcut.href} href={shortcut.href} className={linkClass}>{shortcut.label}</Link>
            ))}
          </nav>
        </div>

        <div className="min-w-0 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <h3 className="font-display text-xl font-semibold leading-snug text-ink">Cotizaciones para revisar</h3>
          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-accent-deep/20 bg-accent-wash p-4 text-accent-deep">
              <p>{data ? "No se ha podido actualizar la lista. Se mantiene la última lectura." : error}</p>
              {loginRequired ? (
                <Link href="/admin/login" className={`${linkClass} mt-3`}>Iniciar sesión</Link>
              ) : (
                <button type="button" onClick={onRetry} disabled={loading} className={`${linkClass} mt-3 disabled:cursor-wait disabled:opacity-50`}>
                  {loading ? "Actualizando…" : "Reintentar"}
                </button>
              )}
            </div>
          )}

          {!data && loading && <p role="status" className="mt-4 text-ink/75">Cargando cotizaciones…</p>}

          {data && (
            <>
              <p className="mt-2 text-ink/75">
                {data.staleCarts.length} {data.staleCarts.length === 1 ? "cotización en esta vista" : "cotizaciones en esta vista"}.
              </p>
              {data.staleCarts.length === 0 ? (
                <div className="mt-4 rounded-xl bg-bone-soft p-4 text-ink/75">
                  <p>No aparecen cotizaciones nuevas o en curso recibidas hace más de 24 horas.</p>
                  <p className="mt-2">Puedes abrir los presupuestos para revisar los recibidos más recientemente.</p>
                </div>
              ) : (
                <ol className="mt-4 divide-y divide-line">
                  {data.staleCarts.map((cart) => (
                    <li key={cart.id}>
                      <Link
                        href={`/admin/cart-quotes/${cart.id}`}
                        className="group flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-4 text-ink transition-colors duration-150 hover:bg-bone-soft active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold [overflow-wrap:anywhere]">{cart.company || cart.name}</p>
                          {cart.company && <p className="break-words text-ink/75 [overflow-wrap:anywhere]">{cart.name}</p>}
                          <p className="text-ink/75">Recibida el <time dateTime={cart.createdAt}>{receivedDate.format(new Date(cart.createdAt))}</time></p>
                          <p className="text-ink/75">{cart.status === "NEW" ? "Nueva" : cart.status === "IN_PROGRESS" ? "En curso" : cart.status}</p>
                        </div>
                        <span aria-hidden="true" className="shrink-0 text-lg text-accent-deep">→</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-4 text-ink/75">
                Última lectura: <time dateTime={data.generatedAt}>{receivedDate.format(new Date(data.generatedAt))}</time>.
                {loading && <span role="status"> Actualizando…</span>}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
