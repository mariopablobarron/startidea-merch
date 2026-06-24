"use client";

/**
 * /admin/facturascripts — Facturación FacturaScripts.
 *
 * Lista los pagos PAID y su estado de sincronización con FacturaScripts
 * (facturas.startidea.tech). Permite sincronizar/reintentar manualmente cada
 * pago (o todas las pendientes). La emisión automática en cada pago está
 * gobernada por FACTURASCRIPTS_SYNC_ENABLED; esta pantalla funciona siempre
 * (acción manual del operador). Roles: CEO + FACTURACION.
 */

import { useCallback, useEffect, useState } from "react";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Payment = {
  id: string;
  amountCents: number;
  currency: string;
  kind: string;
  createdAt: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  fsInvoiceCode: string | null;
  fsInvoiceId: number | null;
  fsSyncedAt: string | null;
  fsError: string | null;
  stripePaymentIntentId: string | null;
  cart: { id: string; name: string; company: string | null; email: string; vatNumber: string | null };
};
type Data = {
  ok: true;
  syncEnabled: boolean;
  fsUrl: string;
  summary: { paid: number; synced: number; errored: number; pending: number };
  payments: Payment[];
};

function estadoOf(p: Payment): "synced" | "error" | "pending" {
  if (p.fsInvoiceCode) return "synced";
  if (p.fsError) return "error";
  return "pending";
}

export default function FacturaScriptsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/facturascripts", { credentials: "include" });
      const d = await r.json();
      if (!r.ok) { setError(d.error || `Error ${r.status}`); return; }
      setData(d);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function sync(paymentId: string): Promise<boolean> {
    setSyncingId(paymentId);
    try {
      const r = await fetch("/api/admin/facturascripts/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const d = await r.json();
      return !!d.ok;
    } catch {
      return false;
    } finally {
      setSyncingId(null);
    }
  }

  async function syncOne(paymentId: string) {
    await sync(paymentId);
    await cargar();
  }

  async function syncAll() {
    if (!data) return;
    const pendientes = data.payments.filter((p) => estadoOf(p) !== "synced");
    if (pendientes.length === 0) return;
    setBulk(true);
    for (const p of pendientes) {
      // eslint-disable-next-line no-await-in-loop
      await sync(p.id);
    }
    setBulk(false);
    await cargar();
  }

  const s = data?.summary;
  const pendientesCount = s ? s.errored + s.pending : 0;

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Facturación</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">FacturaScripts 🧾</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">
            Estado de las facturas en {" "}
            {data?.fsUrl ? (
              <a href={data.fsUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                {data.fsUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : "FacturaScripts"}
            . Sincroniza o reintenta cada pago manualmente; las facturas se emiten como STARTIDEA MALAGA SL.
          </p>
        </header>

        {/* Estado de la emisión automática */}
        {data && (
          <div
            className={`mb-5 rounded-2xl border p-4 text-sm ${
              data.syncEnabled
                ? "border-social/30 bg-social/5 text-ink/80"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {data.syncEnabled ? (
              <>
                <strong>Emisión automática ACTIVADA.</strong> Cada pago confirmado crea su factura
                automáticamente. Esta pantalla sirve para revisar y reintentar los que fallen.
              </>
            ) : (
              <>
                <strong>Emisión automática DESACTIVADA.</strong> Las facturas no se crean solas en cada
                pago — sincronízalas aquí. Para activarla, pon{" "}
                <code className="rounded bg-amber-100 px-1 font-mono text-[12px]">FACTURASCRIPTS_SYNC_ENABLED=true</code>{" "}
                en el entorno (hazlo solo cuando la facturación esté validada).
              </>
            )}
          </div>
        )}

        {/* Resumen */}
        {s && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Pagados", v: s.paid, c: "text-ink" },
              { k: "Con factura", v: s.synced, c: "text-social" },
              { k: "Con error", v: s.errored, c: "text-accent-deep" },
              { k: "Sin sincronizar", v: s.pending, c: "text-ink/70" },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl border border-line bg-bone p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink/55">{x.k}</p>
                <p className={`mt-1 font-display text-2xl font-semibold tabular-nums ${x.c}`}>{x.v}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <button onClick={cargar} className="text-xs font-medium text-ink/60 hover:text-accent">↻ Refrescar</button>
          {pendientesCount > 0 && (
            <button
              onClick={syncAll}
              disabled={bulk || syncingId !== null}
              className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone transition hover:bg-accent disabled:opacity-40"
            >
              {bulk ? "Sincronizando…" : `Sincronizar las ${pendientesCount} pendientes`}
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        {loading && <p className="text-sm text-ink/55">Cargando…</p>}

        {data && data.payments.length === 0 && !loading && (
          <p className="rounded-2xl border border-line bg-bone p-6 text-sm text-ink/55">
            Todavía no hay pagos confirmados. En cuanto entre el primer pago aparecerá aquí.
          </p>
        )}

        {data && data.payments.length > 0 && (
          <div className="overflow-hidden rounded-3xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-bone-soft text-left text-[11px] uppercase tracking-wider text-ink/55">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Cobrado</th>
                  <th className="px-4 py-3">Estado factura</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.payments.map((p) => {
                  const estado = estadoOf(p);
                  const busy = syncingId === p.id || bulk;
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="px-4 py-3 text-ink/70">{fmtDate(p.paidAt || p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{p.cart.company || p.cart.name || "—"}</div>
                        <div className="text-[12px] text-ink/55">{p.cart.email}</div>
                        {p.cart.vatNumber ? (
                          <div className="text-[11px] font-mono text-ink/45">{p.cart.vatNumber}</div>
                        ) : (
                          <div className="text-[11px] font-medium text-accent-deep">⚠ sin CIF/NIF</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink/80">
                        {EUR.format(p.amountCents / 100)}
                        <div className="text-[10px] font-sans text-ink/45">{p.kind === "DEPOSIT" ? "depósito · IVA incl." : "IVA incl."}</div>
                      </td>
                      <td className="px-4 py-3">
                        {estado === "synced" && (
                          <a
                            href={`${data.fsUrl}/EditFacturaCliente?code=${encodeURIComponent(p.fsInvoiceCode!)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-social/10 px-2.5 py-1 text-[12px] font-medium text-social hover:underline"
                          >
                            ✅ Factura {p.fsInvoiceCode}
                          </a>
                        )}
                        {estado === "error" && (
                          <span className="inline-block max-w-xs rounded-lg bg-accent-wash px-2 py-1 text-[11px] text-accent-deep" title={p.fsError || ""}>
                            ⚠ {(p.fsError || "").slice(0, 90)}{(p.fsError || "").length > 90 ? "…" : ""}
                          </span>
                        )}
                        {estado === "pending" && <span className="text-[12px] text-ink/45">⏳ sin sincronizar</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {estado === "synced" ? (
                          <span className="text-[11px] text-ink/35">{fmtDate(p.fsSyncedAt)}</span>
                        ) : (
                          <button
                            onClick={() => syncOne(p.id)}
                            disabled={busy}
                            className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-bone transition hover:bg-accent-dark disabled:opacity-40"
                          >
                            {syncingId === p.id ? "…" : estado === "error" ? "Reintentar" : "Sincronizar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
