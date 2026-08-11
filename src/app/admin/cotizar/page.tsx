"use client";

/**
 * /admin/cotizar — Cotización rápida (todos los proveedores).
 *
 * La admin teclea una referencia (la nuestra STM-XXX/slug o la del proveedor
 * MO-XXX/Makito/Cifra) + cantidad → ve NUESTRO COSTE (producto + marcaje +
 * PORTES del proveedor) y el PVP con margen + IVA, elige técnica de marcaje y
 * genera un presupuesto imprimible para el cliente (que NUNCA muestra proveedor
 * ni coste). Si el cliente trae un CÓDIGO DE DESCUENTO de envío gratis, el envío
 * sale a 0 en su presupuesto.
 */

import { useEffect, useState } from "react";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

type Technique = { techniqueCode: string; techniqueLabel: string; markupPct: number; setupCents: number | null };
type Result = {
  ok: true;
  product: {
    name: string;
    brand: string | null;
    publicRef: string;
    internalRef: string | null;
    slug: string;
    supplier: string;
    supplierRef: string;
    imageUrl: string | null;
    markingTechniqueHint: string | null;
    markingSizeHint: string | null;
    hasRealPricing: boolean;
  };
  qty: number;
  portesCents: number;
  techniques?: Technique[];
  marking?: { techniqueCode: string; techniqueLabel: string; setupCents: number; totalMarkingCents: number; warning?: string };
  coste: { productoTotal: number; marcajeTotal: number; portesTotal: number; total: number };
  margenEfectivoPct: number;
  cupon: { code: string; label: string; tipo: string; discountCents?: number } | null;
  cuponError: string | null;
  envioGratis: boolean;
  pvp: {
    productoTotal: number;
    marcajeTotal: number;
    envioTotal: number;
    descuentoCents: number;
    baseTotal: number;
    unit: number;
    ivaCents: number;
    totalConIva: number;
  };
};

// Parámetros de una línea (mismo shape que /api/admin/cotizar) para re-cotizar
// server-side al guardar.
type LineInput = {
  ref: string;
  qty: number;
  marginPct?: number;
  techniqueCode?: string;
  portesCents: number;
  couponCode?: string;
};
// Línea acumulada en la cesta: input para guardar + snapshot para mostrar.
type BasketLine = {
  input: LineInput;
  product: string;
  ref: string;
  techniqueLabel: string | null;
  qty: number;
  baseTotalCents: number;
};

export default function CotizarPage() {
  const [ref, setRef] = useState("");
  const [qty, setQty] = useState("250");
  const [marginPct, setMarginPct] = useState("60");
  const [portes, setPortes] = useState("8"); // portes del proveedor (coste), en €
  const [couponCode, setCouponCode] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // datos del documento al cliente
  const [clienteNombre, setClienteNombre] = useState("");
  const [plazo, setPlazo] = useState("10-15 días laborables desde la aprobación del arte final");
  const [validez, setValidez] = useState("15 días");
  const [notas, setNotas] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  // propuesta formal (numerada + email)
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteEmpresa, setClienteEmpresa] = useState("");
  const [propLoading, setPropLoading] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);
  const [propResult, setPropResult] = useState<
    { proposalNumber: string; downloadUrl: string; emailed: boolean; emailError?: string } | null
  >(null);
  // presupuesto MULTILÍNEA → CartQuote
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<
    { cartId: string; itemCount: number; estimatedTotalCents: number } | null
  >(null);

  // Prefill desde /admin/products (botón 💸 por fila): /admin/cotizar?ref=STM-XXX
  // Lee la query a mano (sin useSearchParams → sin Suspense) y auto-busca.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (v) {
      setRef(v);
      void cotizar(undefined, v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  async function cotizar(techniqueCode?: string, refOverride?: string) {
    setLoading(true);
    setError(null);
    if (!techniqueCode) setRes(null);
    try {
      const portesCents = Math.max(0, Math.round((parseFloat(portes.replace(",", ".")) || 0) * 100));
      const r = await fetch("/api/admin/cotizar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: (refOverride ?? ref).trim(),
          qty: parseInt(qty, 10) || 1,
          marginPct: marginPct ? Number(marginPct) : undefined,
          techniqueCode,
          portesCents,
          couponCode: couponCode.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        if (!techniqueCode) setRes(null);
        return;
      }
      setRes(d);
      setShowDoc(false);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  // Convierte la cotización actual en una propuesta formal numerada (+ email).
  // Reusa EXACTAMENTE los mismos parámetros que la cotización mostrada para que
  // el servidor recalcule el mismo dinero.
  async function enviarPropuesta(send: boolean) {
    if (!res || !clienteEmail.trim()) return;
    setPropLoading(true);
    setPropError(null);
    setPropResult(null);
    try {
      const portesCents = Math.max(0, Math.round((parseFloat(portes.replace(",", ".")) || 0) * 100));
      const r = await fetch("/api/admin/cotizar/proposal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: ref.trim(),
          qty: parseInt(qty, 10) || 1,
          marginPct: marginPct ? Number(marginPct) : undefined,
          techniqueCode: res.marking?.techniqueCode,
          portesCents,
          couponCode: couponCode.trim() || undefined,
          email: clienteEmail.trim(),
          name: clienteNombre.trim() || undefined,
          company: clienteEmpresa.trim() || undefined,
          send,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setPropError(d.error || `Error ${r.status}`);
        return;
      }
      setPropResult(d);
    } catch {
      setPropError("Error de red");
    } finally {
      setPropLoading(false);
    }
  }

  // ─── Presupuesto multilínea ──────────────────────────────────────────────
  function addLineToBasket() {
    if (!res) return;
    const input: LineInput = {
      ref: ref.trim(),
      qty: parseInt(qty, 10) || 1,
      marginPct: marginPct ? Number(marginPct) : undefined,
      techniqueCode: res.marking?.techniqueCode,
      portesCents: Math.max(0, Math.round((parseFloat(portes.replace(",", ".")) || 0) * 100)),
      couponCode: couponCode.trim() || undefined,
    };
    setLines((prev) => [
      ...prev,
      {
        input,
        product: res.product.name,
        ref: res.product.publicRef,
        techniqueLabel: res.marking?.techniqueLabel ?? null,
        qty: res.qty,
        baseTotalCents: res.pvp.baseTotal,
      },
    ]);
    setSaveResult(null);
    // limpiar para teclear la siguiente línea
    setRef("");
    setRes(null);
    setError(null);
    setShowDoc(false);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardarPresupuesto() {
    if (lines.length === 0 || !clienteNombre.trim() || !clienteEmail.trim()) return;
    setSaveLoading(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const r = await fetch("/api/admin/cotizar/save-lines", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: {
            name: clienteNombre.trim(),
            email: clienteEmail.trim(),
            company: clienteEmpresa.trim() || undefined,
          },
          notes: notas.trim() || undefined,
          lines: lines.map((l) => l.input),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setSaveError(d.error || `Error ${r.status}`);
        return;
      }
      setSaveResult({ cartId: d.cartId, itemCount: d.itemCount, estimatedTotalCents: d.estimatedTotalCents });
      setLines([]);
    } catch {
      setSaveError("Error de red");
    } finally {
      setSaveLoading(false);
    }
  }

  const basketBaseCents = lines.reduce((s, l) => s + l.baseTotalCents, 0);

  const pvpGoods = res ? res.pvp.productoTotal + res.pvp.marcajeTotal : 0;
  const showEnvioLine = res ? res.envioGratis || res.pvp.envioTotal > 0 || res.coste.portesTotal > 0 : false;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <style>{`@media print { body * { visibility: hidden !important; } #presupuesto, #presupuesto * { visibility: visible !important; } #presupuesto { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="mx-auto max-w-3xl">
        <header className="mb-6" data-noprint>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Administración</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Cotización rápida 💸</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            Teclea la referencia (la nuestra <code className="font-mono">STM-…</code> o la del proveedor),
            cantidad y técnica → coste, PVP con margen e IVA, y genera el presupuesto para el cliente.
            Los <strong>portes del proveedor</strong> entran en el coste para que el margen sea real.
          </p>
        </header>

        {/* Buscador */}
        <section className="rounded-3xl border border-line bg-bone p-5">
          <div className="grid gap-3 sm:grid-cols-[2fr,1fr,auto]">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">Referencia</label>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="STM-000123 / MO9999 / neceser-kate"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && cotizar()}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">Cantidad</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && cotizar()}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => cotizar()}
                disabled={loading || !ref.trim()}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
              >
                {loading ? "…" : "Buscar"}
              </button>
            </div>
          </div>
          {/* fila 2: margen, portes (coste), código de descuento */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">Margen %</label>
              <input
                type="number"
                min={0}
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && cotizar()}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">Portes proveedor (coste €)</label>
              <input
                type="text"
                inputMode="decimal"
                value={portes}
                onChange={(e) => setPortes(e.target.value)}
                placeholder="8"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-right font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && cotizar()}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink/55">Código descuento (opcional)</label>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="ENVÍO GRATIS / % dto."
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent"
                onKeyDown={(e) => e.key === "Enter" && cotizar()}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink/45">
            Los portes son el <strong>coste</strong> que te cobra el proveedor (p. ej. MidOcean ~8&nbsp;€ península). Se suman al coste y el margen se calcula sobre el total. Un código de <strong>envío gratis</strong> deja el envío a 0 para el cliente.
          </p>
          {error && <p className="mt-3 rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        </section>

        {/* Presupuesto multilínea → CartQuote guardado */}
        {(lines.length > 0 || saveResult) && (
          <section className="mt-6 rounded-3xl border-2 border-social/40 bg-bone p-5" data-noprint>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-social">
              Presupuesto multilínea{lines.length > 0 ? ` · ${lines.length} línea${lines.length === 1 ? "" : "s"}` : ""}
            </p>

            {saveResult ? (
              <div className="mt-3 rounded-xl bg-social/10 p-4 text-sm text-ink">
                ✓ Presupuesto guardado — {saveResult.itemCount} línea{saveResult.itemCount === 1 ? "" : "s"} ·{" "}
                {EUR.format(saveResult.estimatedTotalCents / 100)} (sin IVA).{" "}
                <a
                  href={`/admin/cart-quotes/${saveResult.cartId}`}
                  className="font-semibold text-accent-deep underline"
                >
                  Abrir en pedidos →
                </a>
              </div>
            ) : (
              <>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1.5">
                          <span className="text-ink">{l.product}</span>{" "}
                          <span className="font-mono text-[10px] text-ink/45">{l.ref}</span>
                          {l.techniqueLabel && (
                            <span className="text-[11px] text-ink/55"> · {l.techniqueLabel}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-ink/70">{l.qty}×</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {EUR.format(l.baseTotalCents / 100)}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            onClick={() => removeLine(i)}
                            className="text-xs text-ink/40 hover:text-accent-deep"
                            title="Quitar línea"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-social/30">
                      <td className="pt-2 font-semibold text-ink" colSpan={2}>
                        Base total (sin IVA)
                      </td>
                      <td className="pt-2 text-right font-mono font-semibold tabular-nums" colSpan={2}>
                        {EUR.format(basketBaseCents / 100)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">Cliente *</label>
                    <input
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      placeholder="Nombre de contacto"
                      className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">Email *</label>
                    <input
                      type="email"
                      value={clienteEmail}
                      onChange={(e) => setClienteEmail(e.target.value)}
                      placeholder="cliente@empresa.com"
                      className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">Empresa</label>
                    <input
                      value={clienteEmpresa}
                      onChange={(e) => setClienteEmpresa(e.target.value)}
                      placeholder="(opcional)"
                      className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-ink/55">Notas internas</label>
                    <input
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="(opcional)"
                      className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {saveError && (
                  <p className="mt-2 rounded-xl bg-accent-wash p-2 text-xs text-accent-deep">⚠ {saveError}</p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-ink/45">
                    Se guarda como pedido editable en <code className="font-mono">/admin/cart-quotes</code>.
                  </p>
                  <button
                    onClick={guardarPresupuesto}
                    disabled={saveLoading || !clienteNombre.trim() || !clienteEmail.trim()}
                    className="rounded-full bg-social px-5 py-2.5 text-sm font-semibold text-bone transition hover:opacity-90 disabled:opacity-50"
                  >
                    {saveLoading ? "Guardando…" : "Guardar presupuesto →"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {res && (
          <>
            {/* Producto + técnicas */}
            <section className="mt-6 rounded-3xl border border-line bg-bone p-5" data-noprint>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink/55">
                    {res.product.publicRef} {res.product.brand ? `· ${res.product.brand}` : ""}
                  </p>
                  <h2 className="mt-1 font-display text-xl text-ink">{res.product.name}</h2>
                  <p className="mt-1 text-[11px] text-ink/45">
                    interno: {res.product.supplier} · {res.product.supplierRef}
                    {!res.product.hasRealPricing && " · ⚠ sin tarifa real (aprox)"}
                  </p>
                </div>
                {res.product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={res.product.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                )}
              </div>

              {res.techniques && res.techniques.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/55">
                    Técnica de marcaje {res.marking && <span className="text-accent">· {res.marking.techniqueLabel}</span>}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {res.techniques.map((t) => (
                      <button
                        key={t.techniqueCode}
                        onClick={() => cotizar(t.techniqueCode)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                          res.marking?.techniqueCode === t.techniqueCode
                            ? "border-accent bg-accent-wash"
                            : "border-line bg-bone-soft hover:border-ink/30"
                        }`}
                      >
                        <code className="font-mono text-xs text-accent-deep">{t.techniqueCode}</code> · {t.techniqueLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Coste (interno) vs PVP (cliente) */}
            <section className="mt-6 grid gap-4 sm:grid-cols-2" data-noprint>
              <div className="rounded-3xl border border-line bg-bone p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/55">Nuestro coste (interno)</p>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    <tr><td className="py-1.5 text-ink/70">Producto</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(res.coste.productoTotal / 100)}</td></tr>
                    <tr><td className="py-1.5 text-ink/70">Marcaje{res.marking?.setupCents ? " (incl. setup)" : ""}</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(res.coste.marcajeTotal / 100)}</td></tr>
                    <tr><td className="py-1.5 text-ink/70">Portes proveedor</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(res.coste.portesTotal / 100)}</td></tr>
                    <tr className="border-t-2 border-ink/20"><td className="pt-2 font-semibold text-ink">Coste total</td><td className="pt-2 text-right font-mono font-semibold tabular-nums">{EUR.format(res.coste.total / 100)}</td></tr>
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-ink/55">Margen efectivo: <strong className="text-social">{res.margenEfectivoPct}%</strong>{res.envioGratis && " · envío regalado al cliente"}</p>
              </div>
              <div className="rounded-3xl border-2 border-accent bg-bone p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">PVP cliente</p>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    <tr><td className="py-1.5 text-ink/70">Producto + marcaje</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(pvpGoods / 100)}</td></tr>
                    {showEnvioLine && (
                      <tr>
                        <td className="py-1.5 text-ink/70">Envío</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {res.envioGratis ? <span className="font-semibold text-social">GRATIS</span> : EUR.format(res.pvp.envioTotal / 100)}
                        </td>
                      </tr>
                    )}
                    {res.cupon?.tipo === "descuento" && res.pvp.descuentoCents > 0 && (
                      <tr><td className="py-1.5 text-social">Descuento ({res.cupon.code})</td><td className="py-1.5 text-right font-mono tabular-nums text-social">−{EUR.format(res.pvp.descuentoCents / 100)}</td></tr>
                    )}
                    <tr><td className="py-1.5 text-ink/70">Base (sin IVA)</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(res.pvp.baseTotal / 100)}</td></tr>
                    <tr><td className="py-1.5 text-ink/70">IVA 21%</td><td className="py-1.5 text-right font-mono tabular-nums">{EUR.format(res.pvp.ivaCents / 100)}</td></tr>
                    <tr className="border-t-2 border-accent/40"><td className="pt-2 font-semibold text-ink">Total con IVA</td><td className="pt-2 text-right font-display text-lg font-semibold tabular-nums text-accent">{EUR.format(res.pvp.totalConIva / 100)}</td></tr>
                    <tr><td className="py-1 text-[11px] text-ink/55">Unitario (sin IVA)</td><td className="py-1 text-right font-mono text-[11px] text-ink/60">{EUR.format(res.pvp.unit / 100)}/u</td></tr>
                  </tbody>
                </table>
                {res.cupon && (
                  <p className="mt-2 rounded-lg bg-social/10 px-3 py-1.5 text-[11px] text-social">
                    ✓ Cupón <strong>{res.cupon.code}</strong> — {res.cupon.tipo === "envio_gratis" ? "envío gratis" : res.cupon.label}
                  </p>
                )}
                {res.cuponError && (
                  <p className="mt-2 rounded-lg bg-accent-wash px-3 py-1.5 text-[11px] text-accent-deep">⚠ Cupón: {res.cuponError}</p>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={addLineToBasket}
                    className="rounded-full border-2 border-social px-4 py-2.5 text-sm font-semibold text-social transition hover:bg-social hover:text-bone"
                  >
                    ➕ Añadir al presupuesto
                  </button>
                  <button
                    onClick={() => setShowDoc(true)}
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bone transition hover:bg-accent"
                  >
                    Generar presupuesto →
                  </button>
                </div>
              </div>
            </section>

            {/* Documento del cliente */}
            {showDoc && (
              <>
                <section className="mt-4 grid gap-3 rounded-3xl border border-line bg-bone p-5 sm:grid-cols-2" data-noprint>
                  <div className="sm:col-span-2"><label className="text-[10px] uppercase tracking-wider text-ink/55">Cliente</label><input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre / empresa del cliente" className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent" /></div>
                  <div><label className="text-[10px] uppercase tracking-wider text-ink/55">Plazo de entrega</label><input value={plazo} onChange={(e) => setPlazo(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent" /></div>
                  <div><label className="text-[10px] uppercase tracking-wider text-ink/55">Validez</label><input value={validez} onChange={(e) => setValidez(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent" /></div>
                  <div className="sm:col-span-2"><label className="text-[10px] uppercase tracking-wider text-ink/55">Notas</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent" /></div>
                  <div className="sm:col-span-2 flex justify-end">
                    <button onClick={() => window.print()} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark">Imprimir / Guardar PDF</button>
                  </div>
                </section>

                {/* Propuesta formal numerada + email al cliente */}
                <section className="mt-4 rounded-3xl border-2 border-social/40 bg-bone p-5" data-noprint>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-social">Propuesta formal (numerada + email)</p>
                  <p className="mt-1 text-[12px] text-ink/60">
                    Genera una propuesta <strong>PROP-AÑO-NNNN</strong> guardada en el sistema, con PDF de marca, y opcionalmente la envía al email del cliente. Aparece en <code className="font-mono">/admin/propuestas</code>. El envío va incluido en el precio.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-ink/55">Email del cliente *</label>
                      <input
                        type="email"
                        value={clienteEmail}
                        onChange={(e) => setClienteEmail(e.target.value)}
                        placeholder="cliente@empresa.com"
                        className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-ink/55">Empresa (opcional)</label>
                      <input
                        value={clienteEmpresa}
                        onChange={(e) => setClienteEmpresa(e.target.value)}
                        placeholder="Nombre de la empresa"
                        className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => enviarPropuesta(true)}
                      disabled={propLoading || !clienteEmail.trim()}
                      className="rounded-full bg-social px-5 py-2.5 text-sm font-semibold text-bone shadow hover:opacity-90 disabled:opacity-40"
                    >
                      {propLoading ? "…" : "Enviar propuesta al cliente ✉️"}
                    </button>
                    <button
                      onClick={() => enviarPropuesta(false)}
                      disabled={propLoading || !clienteEmail.trim()}
                      className="rounded-full border border-line bg-bone-soft px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/30 disabled:opacity-40"
                    >
                      Guardar sin enviar
                    </button>
                  </div>
                  {propError && <p className="mt-3 rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {propError}</p>}
                  {propResult && (
                    <div className="mt-3 rounded-xl bg-social/10 p-3 text-sm text-ink">
                      <p className="font-semibold text-social">
                        ✓ Propuesta {propResult.proposalNumber} {propResult.emailed ? "enviada al cliente" : "guardada"}.
                      </p>
                      {propResult.emailError && (
                        <p className="mt-1 text-[12px] text-accent-deep">
                          El email falló ({propResult.emailError}) — la propuesta quedó guardada, puedes reenviarla.
                        </p>
                      )}
                      <a
                        href={propResult.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[13px] font-medium text-accent underline"
                      >
                        Ver / descargar PDF →
                      </a>
                    </div>
                  )}
                </section>

                {/* Bloque imprimible (lo que ve el cliente — SIN proveedor ni coste) */}
                <section id="presupuesto" className="mt-4 rounded-3xl border border-line bg-white p-8 text-ink">
                  <div className="flex items-start justify-between border-b border-line pb-4">
                    <div>
                      <p className="font-display text-2xl font-semibold">TodoMerchandising</p>
                      <p className="text-xs text-ink/60">STARTIDEA MALAGA SL · CIF B19583632 · pedidos@startidea.es</p>
                    </div>
                    <div className="text-right text-xs text-ink/60">
                      <p className="font-semibold text-ink">PRESUPUESTO</p>
                      {clienteNombre && <p>Cliente: {clienteNombre}</p>}
                      <p>Validez: {validez}</p>
                    </div>
                  </div>

                  <table className="mt-5 w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink/55">
                        <td className="py-2">Concepto</td>
                        <td className="py-2 text-right">Cantidad</td>
                        <td className="py-2 text-right">Importe (sin IVA)</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-line">
                        <td className="py-2">
                          {res.product.name} <span className="text-ink/50">({res.product.publicRef})</span>
                          {res.marking && <div className="text-xs text-ink/60">Personalización: {res.marking.techniqueLabel}</div>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{res.qty} uds</td>
                        <td className="py-2 text-right font-mono tabular-nums">{EUR.format(pvpGoods / 100)}</td>
                      </tr>
                      {showEnvioLine && (
                        <tr className="border-b border-line">
                          <td className="py-2">Envío</td>
                          <td className="py-2 text-right tabular-nums"></td>
                          <td className="py-2 text-right font-mono tabular-nums">
                            {res.envioGratis ? "GRATIS" : EUR.format(res.pvp.envioTotal / 100)}
                          </td>
                        </tr>
                      )}
                      {res.cupon?.tipo === "descuento" && res.pvp.descuentoCents > 0 && (
                        <tr className="border-b border-line">
                          <td className="py-2">Descuento ({res.cupon.code})</td>
                          <td className="py-2 text-right tabular-nums"></td>
                          <td className="py-2 text-right font-mono tabular-nums">−{EUR.format(res.pvp.descuentoCents / 100)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={2} className="py-1 text-right text-ink/70">Base imponible</td><td className="py-1 text-right font-mono tabular-nums">{EUR.format(res.pvp.baseTotal / 100)}</td></tr>
                      <tr><td colSpan={2} className="py-1 text-right text-ink/70">IVA 21%</td><td className="py-1 text-right font-mono tabular-nums">{EUR.format(res.pvp.ivaCents / 100)}</td></tr>
                      <tr><td colSpan={2} className="pt-2 text-right font-semibold">TOTAL</td><td className="pt-2 text-right font-display text-lg font-semibold tabular-nums">{EUR.format(res.pvp.totalConIva / 100)}</td></tr>
                    </tfoot>
                  </table>

                  <div className="mt-5 space-y-1 text-xs text-ink/65">
                    <p><strong className="text-ink">Plazo de entrega:</strong> {plazo}</p>
                    {notas && <p><strong className="text-ink">Notas:</strong> {notas}</p>}
                    <p className="text-ink/45">Precio unitario: {EUR.format(res.pvp.unit / 100)}/ud (sin IVA). Presupuesto sujeto a confirmación de stock y arte final.</p>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
