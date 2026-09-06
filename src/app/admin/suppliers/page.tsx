/**
 * /admin/suppliers — landing del módulo Proveedores (Fase A).
 *
 * Tarjeta por proveedor: estado del catálogo (activos/inactivos, última
 * sync) + ficha de contacto/condiciones comerciales editable inline.
 * Los paneles operativos existentes (sync, cotizador, marking-rates) siguen
 * en sus rutas propias — aquí se enlazan, no se duplican.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { SuppliersClient } from "./SuppliersClient";

export const metadata: Metadata = {
  title: "Proveedores · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SuppliersLandingPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
        <Link href="/admin" className="hover:text-accent">
          Panel
        </Link>
        <span>/</span>
        <span>Proveedores</span>
      </nav>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Proveedores</h1>
      <p className="mb-6 text-sm text-ink/60">
        Contacto, condiciones comerciales y estado del catálogo de cada proveedor.
      </p>
      <Link
        href="/admin/suppliers/auditoria-precios"
        className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-line bg-bone-soft px-5 py-4 transition-colors hover:border-accent/40"
      >
        <span>
          <span className="block font-medium text-ink">Auditoría de precios →</span>
          <span className="mt-0.5 block text-sm text-ink/60">
            Si el precio público sale de la tarifa real del proveedor y lleva nuestro margen, y en
            qué productos no.
          </span>
        </span>
      </Link>
      <SuppliersClient />
    </div>
  );
}
