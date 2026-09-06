/**
 * /admin/suppliers/auditoria-precios — la auditoría del precio público.
 *
 * Los mismos números que imprime `bun scripts/audit-precios-catalogo.ts`,
 * sin terminal y sin credenciales de producción. El script sigue existiendo
 * para quien prefiera la consola; los dos llaman a `auditarPrecios`.
 *
 * Enseña COSTES NETOS de proveedor, así que va cerrada a CEO y FACTURACIÓN —
 * el esquema dice «COMERCIAL … sin costes ni payments»—. Se responde 404 y no
 * 403 para no confirmarle a nadie qué páginas existen, como en /admin/team.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
import { AuditoriaPreciosClient } from "./AuditoriaPreciosClient";

export const metadata: Metadata = {
  title: "Auditoría de precios · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AuditoriaPreciosPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const session = await getAdminSession();
  if (session?.role !== "CEO" && session?.role !== "FACTURACION") notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
        <Link href="/admin" className="hover:text-accent">
          Panel
        </Link>
        <span>/</span>
        <Link href="/admin/suppliers" className="hover:text-accent">
          Proveedores
        </Link>
        <span>/</span>
        <span>Auditoría de precios</span>
      </nav>
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Auditoría de precios</h1>
      <p className="max-w-3xl text-sm text-ink/60">
        ¿El precio que ve el cliente sale de la tarifa real del proveedor y lleva nuestro margen? Y
        si no, ¿en cuántos productos y en cuáles. Solo lee: no cambia nada del catálogo.
      </p>
      <AuditoriaPreciosClient />
    </div>
  );
}
