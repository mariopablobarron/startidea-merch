import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { listarPresupuestos, resumenPresupuesto } from "@/lib/presupuesto-repo";
import { leerMargenes } from "@/lib/presupuesto-margenes";
import { MARGEN_AVISO_PCT } from "@/lib/presupuesto-calculo";
import { NuevoPresupuestoBoton } from "@/components/admin/NuevoPresupuestoBoton";
import { MargenesForm } from "@/components/admin/MargenesForm";
import type { PresupuestoEstado } from "@prisma/client";

export const metadata: Metadata = {
  title: "Presupuestos",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<PresupuestoEstado, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  ACEPTADO: "Aceptado",
  CADUCADO: "Caducado",
};

const ESTADO_COLOR: Record<PresupuestoEstado, string> = {
  BORRADOR: "bg-ink/5 text-ink/60",
  ENVIADO: "bg-accent/15 text-accent",
  ACEPTADO: "bg-social/15 text-social",
  CADUCADO: "bg-accent-wash text-accent-deep",
};

const eur = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" }).format(
    cents / 100,
  );

export default async function PresupuestosPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [items, margenes] = await Promise.all([listarPresupuestos(), leerMargenes()]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Presupuestos de merchandising</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            El documento de tres páginas de Startidea Málaga, S.L. Los precios salen del portal
            del proveedor a la cantidad exacta; aquí se les pone el margen y se arma la oferta.
          </p>
        </div>
        <NuevoPresupuestoBoton />
      </header>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink/[0.03] text-left text-[11px] uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente / asunto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Venta (base)</th>
              <th className="px-4 py-3 text-right">Coste</th>
              <th className="px-4 py-3 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink/50">
                  Todavía no hay presupuestos. El primero se crea con el botón de arriba.
                </td>
              </tr>
            )}
            {items.map((p) => {
              // El escenario recomendado es el que se enseña en el listado: es
              // el que el cliente va a mirar primero.
              const escenarios = resumenPresupuesto(p);
              const principal = escenarios.find((e) => e.recomendado) ?? escenarios[0];
              const bajo = principal.totales.margenPct < MARGEN_AVISO_PCT;
              return (
                <tr key={p.id} className="border-t border-line/70 hover:bg-ink/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/presupuestos/${p.id}`} className="text-accent hover:underline">
                      {p.numero}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-ink/40">
                      {p.createdAt.toLocaleDateString("es-ES")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{p.clienteNombre}</div>
                    <div className="text-xs text-ink/50">{p.asunto}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_COLOR[p.estado]}`}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur(principal.totales.baseCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink/60">
                    {eur(principal.totales.costeCents)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${bajo ? "font-semibold text-red-600" : ""}`}>
                    {eur(principal.totales.margenCents)}
                    <span className="block text-[11px] text-ink/50">
                      {principal.totales.margenPct.toFixed(1).replace(".", ",")} %
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <MargenesForm inicial={margenes} />
    </div>
  );
}
