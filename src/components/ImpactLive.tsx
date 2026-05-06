"use client";

import { useEffect, useState } from "react";

type Impact = {
  ordersFulfilled: number;
  itemsProduced: number;
  companiesServed: number;
  eurInvestedInCEE: number;
  co2SavedKg: number;
  productsActive: number;
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatNumber(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Anima un número de 0 al valor objetivo en ~700ms con easing. */
function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setVal(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function ImpactLive() {
  const [data, setData] = useState<Impact | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/impact")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setData(d as Impact);
        else setError(true);
      })
      .catch(() => setError(true));
  }, []);

  // Valores fallback si aún no hay nada (web recién lanzada)
  const fallback: Impact = {
    ordersFulfilled: 0,
    itemsProduced: 0,
    companiesServed: 0,
    eurInvestedInCEE: 0,
    co2SavedKg: 0,
    productsActive: 0,
  };
  const v = data || fallback;
  const isEmpty = !data || (v.itemsProduced === 0 && v.companiesServed === 0);

  if (error) return null;

  return (
    <section
      id="impacto-real"
      className="border-t border-line bg-ink text-bone"
    >
      <div className="mx-auto max-w-8xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-xs font-medium uppercase tracking-wider text-accent-light">
          Impacto real · datos en directo
        </p>
        <h2 className="mt-3 max-w-3xl font-display text-section font-semibold">
          {isEmpty
            ? "Estamos empezando. Cada pedido cuenta desde el primero."
            : "Impacto que sí se mide."}
        </h2>
        <p className="mt-4 max-w-2xl text-bone/70">
          {isEmpty
            ? "Aún no hay pedidos cerrados, pero el catálogo ya está activo y la primera campaña en marcha. Cuando empiece a haber datos reales, aparecerán aquí actualizados."
            : "Cifras agregadas y actualizadas automáticamente desde nuestros pedidos confirmados. Sin maquillaje."}
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Empresas atendidas" value={formatNumber(useCountUp(v.companiesServed))} />
          <Stat label="Productos producidos" value={formatNumber(useCountUp(v.itemsProduced))} />
          <Stat
            label="Invertido en CEE"
            value={EUR.format(useCountUp(v.eurInvestedInCEE))}
            sub="estimación 40% del total facturado"
          />
          <Stat
            label="CO₂ ahorrado"
            value={`${formatNumber(useCountUp(v.co2SavedKg))} kg`}
            sub="vs. fabricación equivalente en Asia"
          />
        </div>

        <p className="mt-12 text-xs text-bone/40">
          {v.productsActive > 0 && `Catálogo activo: ${formatNumber(v.productsActive)} productos personalizables · `}
          Cifras computadas desde los pedidos confirmados en producción. Auditables a petición.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="font-display text-5xl font-semibold tabular-nums text-bone">{value}</p>
      <p className="mt-3 text-sm font-medium uppercase tracking-wider text-accent-light">{label}</p>
      {sub && <p className="mt-1 text-xs text-bone/50">{sub}</p>}
    </div>
  );
}
