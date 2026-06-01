/**
 * /admin/insights/search-aliases
 *
 * Gestión de SearchAlias: el admin define redirecciones para queries
 * concretas del navbar (ej. «teletrabajo» → /catalogo?q=mochila+termo).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { SearchAliasesClient } from "./SearchAliasesClient";

export const metadata: Metadata = {
  title: "Alias de búsqueda · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SearchAliasesPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const rows = await prisma.searchAlias.findMany({
    orderBy: [{ active: "desc" }, { hitCount: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return (
    <AdminChrome>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <span>Alias de búsqueda</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Alias de búsqueda
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Cuando un cliente escribe en el navbar lo que defines aquí, lo
          redirigimos directamente a la página o búsqueda que mejor cubre su
          intención. Útil para queries genéricas (&laquo;teletrabajo&raquo;,
          &laquo;kit verano&raquo;) que ningún producto se llama literalmente
          pero que sí tienes en el catálogo.
        </p>

        <SearchAliasesClient
          initialAliases={rows.map((r) => ({
            id: r.id,
            query: r.queryLower,
            redirectTo: r.redirectTo,
            description: r.description,
            active: r.active,
            hitCount: r.hitCount,
          }))}
        />
      </div>
    </AdminChrome>
  );
}
